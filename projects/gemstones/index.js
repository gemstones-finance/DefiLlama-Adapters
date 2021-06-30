const sdk = require("@defillama/sdk");
const { unwrapUniswapLPs } = require("../helper/unwrapLPs");
const { transformPolygonAddress } = require("../helper/portedTokens");
const abi = require("./abi.json");
const erc20 = require("../helper/abis/erc20.json");

const masterChef = "0x9BFD897e3eabFfA738a8F1c4d0B397C07E97E42D";

const polygonTvl = async (timestamp, ethBlock, chainBlocks) => {
  const block = chainBlocks["polygon"];
  let balances = {};

  // --- Check the masterchef poolLenght and all the bal from lp/underlyings ---
  const poolLength = (
    await sdk.api.abi.call({
      abi: abi.poolLength,
      target: masterChef,
      block,
      chain: "polygon",
    })
  ).output;

  const lpAddresses = [];

  for (let i = 0; i < poolLength; i++) {
    const poolInfo = (
      await sdk.api.abi.call({
        block,
        target: masterChef,
        params: i,
        abi: abi.poolInfo,
        chain: "polygon",
      })
    ).output;

    lpAddresses.push(poolInfo[0]);
  }

  const tokens0 = (
    await sdk.api.abi.multiCall({
      block,
      abi: {
        constant: true,
        inputs: [],
        name: "token0",
        outputs: [{ internalType: "address", name: "", type: "address" }],
        payable: false,
        stateMutability: "view",
        type: "function",
      },
      calls: lpAddresses.map((addr) => ({ target: addr })),
      chain: "polygon",
    })
  ).output.map((token) => token.output);

  const nonNull = tokens0
    .map((el, idx) => {
      if (el != null) return idx;
    })
    .filter((el) => el != null);

  const balOf = (
    await sdk.api.abi.multiCall({
      abi: erc20.balanceOf,
      calls: lpAddresses.map((lp) => ({
        target: lp,
        params: masterChef,
      })),
      chain: "polygon",
      block,
    })
  ).output.map((bal) => bal.output);

  let lpPositions = [];

  balOf.forEach((bal, idx) => {
    if (nonNull.includes(idx)) {
      lpPositions.push({
        balance: bal,
        token: lpAddresses[idx],
      });
    }
  });

  balOf.forEach((bal, idx) => {
    if (!nonNull.includes(idx)) {
      sdk.util.sumSingleBalance(balances, `polygon:${lpAddresses[idx]}`, bal);
    }
  });

  const transformAdress = await transformPolygonAddress();

  await unwrapUniswapLPs(
    balances,
    lpPositions,
    block,
    "polygon",
    transformAdress
  );

  return balances;
};

module.exports = {
  polygon: {
    tvl: polygonTvl,
  },
  tvl: sdk.util.sumChainTvls([polygonTvl]),
};
