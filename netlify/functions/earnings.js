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

    // 2. FMP - Get earnings, FILTER FOR US ONLY
    const fmpUrl = `https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&apikey=${process.env.FMP_KEY}`;
    const fmpRes = await axios.get(fmpUrl);
    
    // Filter: US tickers only - no.T,.TO,.L,.PA etc, and exclude OTC: no 5-letter tickers ending in F,Y,Z
    const usEarnings = fmpRes.data.filter(item => {
      const symbol = item.symbol;
      const isUS =!symbol.includes('.') && symbol.length <= 5;
      const isNotOTC =!(symbol.length === 5 && /[FYZW]$/i.test(symbol));
      return isUS && isNotOTC;
    });

    console.log(`Found ${usEarnings.length} US earnings out of ${fmpRes.data.length} total`);

    // 3. Process each US ticker
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
        console.log(`ORATS failed for ${ticker}:`, e.message);
      }

      try {
        // TRADIR - adjust this endpoint to your actual one
        const tradirUrl = `https://api.tradir.com/flow`;
        const tradirRes = await axios.get(tradirUrl, {
          headers: { 'Authorization': `Bearer ${process.env.TRADIR_KEY}` },
          params: { ticker: ticker }
        });
        net_flow = tradirRes.data.netFlow || 0;
      } catch (e) {
        console.log(`TRADIR failed for ${ticker}:`, e.message);
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
