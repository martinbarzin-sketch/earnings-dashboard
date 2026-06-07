const axios = require('axios');

exports.handler = async (event) => {
  try {
    // 1. Calculate next week's Monday-Friday for earnings
    const today = new Date();
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + (8 - today.getDay()) % 7);
    const nextFriday = new Date(nextMonday);
    nextFriday.setDate(nextMonday.getDate() + 4);
    
    const from = nextMonday.toISOString().split('T')[0];
    const to = nextFriday.toISOString().split('T')[0];

    // 2. FMP - NEW STABLE ENDPOINT - no more v3
    const fmpUrl = `https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&apikey=${process.env.FMP_KEY}`;
    const fmpRes = await axios.get(fmpUrl);
    const earnings = fmpRes.data || [];

    // 3. For each ticker, get ORATS + TRADIR data
    const results = [];
    
    // Limit to 8 tickers so we don't timeout on Netlify free tier
    for (const item of earnings.slice(0, 8)) {
      const ticker = item.symbol;
      
      try {
        // ORATS call
        const oratsUrl = `https://api.orats.io/datav2/cores.json?ticker=${ticker}&token=${process.env.ORATS_TOKEN}`;
        const oratsRes = await axios.get(oratsUrl);
        const oratsData = oratsRes.data.data[0] || {};

        // TRADIR call - example, adjust to your endpoint
        const tradirUrl = `https://api.tradir.com/flow?ticker=${ticker}`;
        const tradirRes = await axios.get(tradirUrl, {
          headers: { 'Authorization': `Bearer ${process.env.TRADIR_KEY}` }
        });
        
        results.push({
          ticker: ticker,
          date: item.date,
          eps_est: item.epsEstimated || 0,
          implied_move: oratsData.impliedMove || 0,
          iv_rank: oratsData.ivRank || 0,
          net_flow: tradirRes.data.netFlow || 0
        });
        
      } catch (tickerError) {
        console.log(`Failed ${ticker}:`, tickerError.message);
        // Push basic data even if ORATS/TRADIR fails
        results.push({
          ticker: ticker,
          date: item.date,
          eps_est: item.epsEstimated || 0,
          implied_move: 0,
          iv_rank: 0,
          net_flow: 0
        });
      }
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
