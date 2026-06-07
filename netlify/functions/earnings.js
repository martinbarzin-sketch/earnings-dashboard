const axios = require('axios');

exports.handler = async (event) => {
  try {
    // 1. Calculate next week's Monday-Friday
    const today = new Date();
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + (8 - today.getDay()) % 7);
    const nextFriday = new Date(nextMonday);
    nextFriday.setDate(nextMonday.getDate() + 4);
    
    const from = nextMonday.toISOString().split('T')[0];
    const to = nextFriday.toISOString().split('T')[0];
    
    console.log(`Checking earnings from ${from} to ${to}`);

    // 2. FMP - Get earnings, FILTER FOR REAL US STOCKS ONLY
    const fmpUrl = `https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&apikey=${process.env.FMP_KEY}`;
    const fmpRes = await axios.get(fmpUrl);
    
    // Strong filter: US only, no OTC, no bankrupt, market cap > 300M
    const usEarnings = fmpRes.data.filter(item => {
      const symbol = item.symbol;
      const isUS =!symbol.includes('.') && symbol.length <= 5;
      const isNotOTC =!(symbol.length === 5 && /[FYZWQX]$/i.test(symbol));
      const isNotBankrupt =!symbol.endsWith('Q'); // CBKCQ, etc
      const hasMarketCap = (item.marketCap || 0) > 300000000; // 300M+ only
      return isUS && isNotOTC && isNotBankrupt && hasMarketCap;
    });

    console.log(`Found ${usEarnings.length} real US earnings out of ${fmpRes.data.length} total`);

    // 3. TEMP TEST - Check if ORATS is working
    try {
      const testOrats = await axios.get(`https://api.orats.io/datav2/cores.json?ticker=GME&token=${process.env.ORATS_TOKEN}`);
      console.log('ORATS TEST - GME data:', {
        impliedMove: testOrats.data.data[0]?.impliedMove,
        ivRank: testOrats.data.data[0]?.ivRank
      });
    } catch(e) {
      console.log('ORATS TEST FAILED:', e.response?.status, e.message);
    }

    // 4. Process each real US ticker
    const results = [];
    for (const item of usEarnings.slice(0, 8)) {
      const ticker = item.symbol;
      let implied_move = 0, iv_rank = 0, net_flow = 0;
      
      try {
        // ORATS - cores data
        const oratsUrl = `https://api.orats.io/datav2/cores.json?ticker=${ticker}&token=${process.env.ORATS_TOKEN}`;
        const oratsRes = await axios.get(oratsUrl);
        const oratsData = oratsRes.data.data?.[0] || {};
        implied_move = oratsData.impliedMove || 0;
        iv_rank = oratsData.ivRank || 0;
      } catch (e) {
        console.log(`ORATS failed for ${ticker}:`, e.response?.status || e.message);
      }

      try {
        // TRADIR - adjust endpoint if needed
        const tradirUrl = `https://api.tradir.com/v1/flow`;
        const tradirRes = await axios.get(tradirUrl, {
          headers: { 'Authorization': `Bearer ${process.env.TRADIR_KEY}` },
          params: { ticker: ticker }
        });
        net_flow = tradirRes.data.netFlow || tradirRes.data.net_flow || 0;
      } catch (e) {
        console.log(`TRADIR failed for ${ticker}:`, e.response?.status || e.message);
      }
      
      results.push({
        ticker: ticker,
        date: item.date,
        eps_est: item.epsEstimated || 0,
        implied_move: parseFloat(implied_move.toFixed(2)),
        iv_rank: Math.round(iv_rank),
        net_flow: Math.round(net_flow)
      });
    }

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' 
      },
      body: JSON.stringify(results)
    };
    
  } catch (error) {
    console.log('Function error:', error.message);
    return {
      statusCode: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' 
      },
      body: JSON.stringify({ 
        error: error.message, 
        data: [] 
      })
    };
  }
};
