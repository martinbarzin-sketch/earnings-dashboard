const axios = require('axios');

exports.handler = async (event) => {
  try {
    // 1. Scan NEXT 30 DAYS to actually find earnings
    const today = new Date();
    const from = today.toISOString().split('T')[0];
    const thirtyDays = new Date(today);
    thirtyDays.setDate(today.getDate() + 30);
    const to = thirtyDays.toISOString().split('T')[0];
    
    console.log(`Checking earnings from ${from} to ${to}`);

    // 2. FMP - Get earnings, FILTER FOR REAL US STOCKS ONLY
    const fmpUrl = `https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&apikey=${process.env.FMP_KEY}`;
    const fmpRes = await axios.get(fmpUrl);
    
    const usEarnings = fmpRes.data.filter(item => {
      const symbol = item.symbol;
      const isUS =!symbol.includes('.') && symbol.length <= 5;
      const isNotOTC =!(symbol.length === 5 && /[FYZWQX]$/i.test(symbol));
      const isNotBankrupt =!symbol.endsWith('Q');
      const hasMarketCap = (item.marketCap || 0) > 1000000000; // 1B+ only for real options
      return isUS && isNotOTC && isNotBankrupt && hasMarketCap;
    });

    console.log(`Found ${usEarnings.length} real US earnings out of ${fmpRes.data.length} total`);

    // 3. ORATS - NEW ENDPOINT + FIELD NAMES FOR 2026
    try {
      const testOrats = await axios.get(`https://api.orats.io/datav2/hist/one?token=${process.env.ORATS_TOKEN}&ticker=GME`);
      console.log('ORATS TEST - GME data:', {
        ivRank: testOrats.data.data?.[0]?.ivRank,
        forecastMove: testOrats.data.data?.[0]?.forecastMove,
        ticker: testOrats.data.data?.[0]?.ticker
      });
    } catch(e) {
      console.log('ORATS TEST FAILED:', e.response?.status, e.message);
    }

    // 4. Process each ticker
    const results = [];
    const sortedEarnings = usEarnings.sort((a,b) => new Date(a.date) - new Date(b.date));
    
    for (const item of sortedEarnings.slice(0, 10)) {
      const ticker = item.symbol;
      let implied_move = 0, iv_rank = 0, net_flow = 0;
      
      try {
        // ORATS - Updated endpoint: hist/one instead of cores.json
        const oratsUrl = `https://api.orats.io/datav2/hist/one?token=${process.env.ORATS_TOKEN}&ticker=${ticker}`;
        const oratsRes = await axios.get(oratsUrl);
        const oratsData = oratsRes.data.data?.[0] || {};
        implied_move = oratsData.forecastMove * 100 || 0; // forecastMove is decimal, convert to %
        iv_rank = oratsData.ivRank || 0;
      } catch (e) {
        console.log(`ORATS failed for ${ticker}:`, e.response?.status || e.message);
      }

      try {
        // TRADIR - if you have docs, update this. Comment out if not working
        // const tradirUrl = `https://api.tradir.com/v1/flow`;
        // const tradirRes = await axios.get(tradirUrl, {
        // headers: { 'Authorization': `Bearer ${process.env.TRADIR_KEY}` },
        // params: { ticker: ticker }
        // });
        // net_flow = tradirRes.data.netFlow || 0;
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
