const axios = require('axios');

exports.handler = async (event) => {
  try {
    // 1. Scan NEXT 30 DAYS
    const today = new Date();
    const from = today.toISOString().split('T')[0];
    const thirtyDays = new Date(today);
    thirtyDays.setDate(today.getDate() + 30);
    const to = thirtyDays.toISOString().split('T')[0];
    
    console.log(`Checking earnings from ${from} to ${to}`);

    // 2. FMP - Get earnings
    const fmpUrl = `https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&apikey=${process.env.FMP_KEY}`;
    const fmpRes = await axios.get(fmpUrl);
    
    const usEarnings = fmpRes.data.filter(item => {
      const symbol = item.symbol;
      const isUS =!symbol.includes('.') && symbol.length <= 5;
      const isNotOTC =!(symbol.length === 5 && /[FYZWQX]$/i.test(symbol));
      const isNotBankrupt =!symbol.endsWith('Q');
      return isUS && isNotOTC && isNotBankrupt;
    });

    console.log(`Found ${usEarnings.length} US earnings out of ${fmpRes.data.length} total`);

    // 3. Process tickers with CORRECT ORATS fields
    const results = [];
    const sortedEarnings = usEarnings.sort((a,b) => new Date(a.date) - new Date(b.date));
    
    for (const item of sortedEarnings.slice(0, 15)) {
      const ticker = item.symbol;
      let implied_move = 0, iv_30d = 0, earnings_move = 0;
      
      try {
        // ORATS - /datav2/live/summaries works
        const oratsUrl = `https://api.orats.io/datav2/live/summaries?token=${process.env.ORATS_TOKEN}&ticker=${ticker}`;
        const oratsRes = await axios.get(oratsUrl);
        const oratsData = oratsRes.data.data?.[0] || {};
        
        implied_move = (oratsData.impliedMove || 0) * 100; // 0.0517 → 5.17
        iv_30d = (oratsData.iv30d || 0) * 100; // 0.4455 → 44.55
        earnings_move = (oratsData.impliedEarningsMove || 0) * 100; // 0.038 → 3.8
        
      } catch (e) {
        console.log(`ORATS failed for ${ticker}:`, e.response?.status);
      }
      
      results.push({
        ticker: ticker,
        date: item.date,
        eps_est: item.epsEstimated || 0,
        implied_move: parseFloat(implied_move.toFixed(2)),
        iv_30d: parseFloat(iv_30d.toFixed(2)), // Using 30D IV instead of IV Rank
        earnings_move: parseFloat(earnings_move.toFixed(2)), // Better for your DLTR setup
        net_flow: 0
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
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message, data: [] })
    };
  }
};
