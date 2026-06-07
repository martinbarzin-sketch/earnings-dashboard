const axios = require('axios');

exports.handler = async (event) => {
  const tickers = ['CASY','GME','CHWY','THO','JILL'];
  const results = [];

  for (let t of tickers) {
    // FMP
    const fmp = await axios.get(`https://financialmodelingprep.com/api/v3/earnings-surprises/${t}?apikey=${process.env.FMP_KEY}`);

    // ORATS
    const orats = await axios.get(`https://api.orats.io/datav2/strikes?token=${process.env.ORATS_TOKEN}&ticker=${t}`);

    // TRADIR
    const tradir = await axios.get(`https://api.tradir.com/v1/flow?ticker=${t}&apikey=${process.env.TRADIR_KEY}`);

    results.push({
      ticker: t,
      eps_est: fmp.data[0]?.estimatedEarning,
      implied_move: orats.data.impliedMove,
      iv_rank: orats.data.ivRank,
      net_flow: tradir.data.netPremium
    });
  }

  return { statusCode: 200, body: JSON.stringify(results) };
};
