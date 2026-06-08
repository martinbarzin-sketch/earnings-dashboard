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

    // 2. FMP - Get earnings, NO MARKET CAP FILTER - FMP doesn't provide it here
    const fmpUrl = `https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&apikey=${process.env.FMP_KEY}`;
    const fmpRes = await axios.get(fmpUrl);
    
    // Filter: US only, no OTC, no bankrupt. Keep all market caps for now.
    const usEarnings = fmpRes.data.filter(item => {
      const symbol = item.symbol;
      const isUS =!symbol.includes('.') && symbol.length <= 5;
      const isNotOTC =!(symbol.length === 5 && /[FYZWQX]$/i.test(symbol));
      const isNotBankrupt =!symbol.endsWith('Q');
      return isUS && isNotOTC && isNotBankrupt;
    });

    console.log(`Found ${usEarnings.length} US earnings out of ${fmpRes.data.length} total`);

    // 3. ORATS TEST - with better error logging
    try {
      const testOrats = await axios.get(`https://api.orats.io/datav2/hist/one?token=${process.env.ORATS_TOKEN}&ticker=GME`);
      console.log('ORATS TEST SUCCESS - GME data:', {
        ivRank: testOrats.data.data?.[0]?.ivRank,
        forecastMove: testOrats.data.data?.[0]?.forecastMove
      });
    } catch(e) {
      console.log('ORATS TEST FAILED:', e.response?.status, e.response?.data || e.message);
    }

    // 4. Process tickers, skip ORATS if it fails
    const results = [];
    const sortedEarnings = usEarnings.sort((a,b) => new Date(a.date) - new Date(b.date));
    
    for (const item of sortedEarnings.slice(0, 15)) { // Check 15 now
      const ticker = item.symbol;
      let implied_move = 0, iv_rank = 0;
      
      try {
        const oratsUrl = `https://api.orats.io/datav2/hist/one?token=${process.env.ORATS_TOKEN}&ticker=${ticker}`;
        const oratsRes = await axios.get(oratsUrl);
        const oratsData = oratsRes.data.data?.[0] || {};
        implied_move = (oratsData.forecastMove || 0) * 100;
        iv_rank = oratsData.ivRank || 0;
      } catch (e) {
        // ORATS failed, but we still show the ticker
        console.log(`ORATS failed for ${ticker}:`, e.response?.status);
      }
      
      results.push({
        ticker: ticker,
        date: item.date,
        eps_est: item.epsEstimated || 0,
        implied_move: parseFloat(implied_move.toFixed(2)),
        iv_rank: Math.round(iv_rank),
        net_flow: 0 // TRADIR disabled for now
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
