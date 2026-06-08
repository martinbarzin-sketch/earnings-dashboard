const axios = require('axios');

exports.handler = async (event) => {
  try {
    const today = new Date();
    const from = today.toISOString().split('T')[0];
    const thirtyDays = new Date(today);
    thirtyDays.setDate(today.getDate() + 30);
    const to = thirtyDays.toISOString().split('T')[0];
    
    console.log(`Checking earnings from ${from} to ${to}`);

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

    const results = [];
    const sortedEarnings = usEarnings.sort((a,b) => new Date(a.date) - new Date(b.date));
    
    for (const item of sortedEarnings.slice(0, 30)) {
      const ticker = item.symbol;
      
      try {
        const oratsUrl = `https://api.orats.io/datav2/live/summaries?token=${process.env.ORATS_TOKEN}&ticker=${ticker}`;
        const oratsRes = await axios.get(oratsUrl);
        const oratsData = oratsRes.data.data?.[0];
        
        // THIS LINE KILLS ALL THE JUNK TICKERS
        if (!oratsData ||!oratsData.impliedMove || oratsData.impliedMove === 0) {
          continue;
        }
        
        results.push({
          ticker: ticker,
          date: item.date,
          eps_est: item.epsEstimated || 0,
          implied_move: parseFloat((oratsData.impliedMove * 100).toFixed(2)),
          iv_30d: parseFloat((oratsData.iv30d * 100).toFixed(2)),
          earnings_move: parseFloat((oratsData.impliedEarningsMove * 100).toFixed(2)),
          net_flow: 0
        });
        
      } catch (e) {
        // Skip silently
      }
    }

    console.log(`Returning ${results.length} tickers with real options data`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(results)
    };
    
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message, data: [] })
    };
  }
};
