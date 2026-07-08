export const MINIMAL_TOKENS: Array<{ identifier: string; decimals: number }> = [
  // Gas assets for all supported chains (API_SUPPORTED_CHAINS)
  { decimals: 8, identifier: "BTC.BTC" },
  { decimals: 18, identifier: "ETH.ETH" },
  { decimals: 6, identifier: "TRON.TRX" },
  { decimals: 18, identifier: "BSC.BNB" },
  { decimals: 9, identifier: "SOL.SOL" },
  { decimals: 8, identifier: "ZEC.ZEC" },
  { decimals: 6, identifier: "XRP.XRP" },
  { decimals: 18, identifier: "ARB.ETH" },
  { decimals: 18, identifier: "BASE.ETH" },
  { decimals: 18, identifier: "OP.ETH" },
  { decimals: 18, identifier: "POL.POL" },
  { decimals: 18, identifier: "AVAX.AVAX" },
  { decimals: 6, identifier: "ADA.ADA" },
  { decimals: 6, identifier: "GAIA.ATOM" },
  { decimals: 9, identifier: "SUI.SUI" },
  { decimals: 24, identifier: "NEAR.NEAR" },
  { decimals: 8, identifier: "DOGE.DOGE" },
  { decimals: 8, identifier: "LTC.LTC" },
  { decimals: 8, identifier: "BCH.BCH" },
  { decimals: 8, identifier: "DASH.DASH" },
  { decimals: 18, identifier: "GNO.xDAI" },
  { decimals: 18, identifier: "XLAYER.OKB" },
  { decimals: 8, identifier: "THOR.RUNE" },
  { decimals: 10, identifier: "MAYA.CACAO" },
  { decimals: 18, identifier: "BERA.BERA" },
  { decimals: 18, identifier: "MONAD.MON" },
  { decimals: 18, identifier: "XRD.XRD" },
  { decimals: 6, identifier: "KUJI.KUJI" },
  { decimals: 9, identifier: "TON.TON" },
  { decimals: 18, identifier: "STRK.STRK" },
  { decimals: 7, identifier: "XLM.XLM" },

  // USDT - Most widely used stablecoin across chains
  { decimals: 6, identifier: "ETH.USDT-0xdAC17F958D2ee523a2206206994597C13D831ec7" },
  { decimals: 6, identifier: "ARB.USDT-0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" },
  { decimals: 6, identifier: "BASE.USDT-0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2" },
  { decimals: 6, identifier: "OP.USDT-0x94b008aA00579c1307B0EF2c499aD98a8ce58e58" },
  { decimals: 6, identifier: "POL.USDT-0xc2132D05D31c914a87C6611C10748AEb04B58e8F" },
  { decimals: 6, identifier: "AVAX.USDT-0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7" },
  { decimals: 18, identifier: "BSC.USDT-0x55d398326f99059fF775485246999027B3197955" },
  { decimals: 6, identifier: "TRON.USDT-TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" },

  // USDC - Second most popular stablecoin
  { decimals: 6, identifier: "ETH.USDC-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
  { decimals: 6, identifier: "ARB.USDC-0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
  { decimals: 6, identifier: "BASE.USDC-0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  { decimals: 6, identifier: "OP.USDC-0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" },
  { decimals: 6, identifier: "POL.USDC-0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" },
  { decimals: 6, identifier: "AVAX.USDC-0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E" },
  { decimals: 18, identifier: "BSC.USDC-0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" },

  // WBTC - Wrapped Bitcoin on EVM chains
  { decimals: 8, identifier: "ETH.WBTC-0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" },
  { decimals: 8, identifier: "ARB.WBTC-0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f" },
  { decimals: 8, identifier: "OP.WBTC-0x68f180fcCe6836688e9084f035309E29Bf0A2095" },
  { decimals: 8, identifier: "POL.WBTC-0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6" },
  { decimals: 8, identifier: "AVAX.WBTC-0x50b7545627a5162F82A992c33b87aDc75187B218" },

  // cbBTC - Coinbase wrapped Bitcoin
  { decimals: 8, identifier: "ARB.cbBTC-0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" },
  { decimals: 8, identifier: "BASE.cbBTC-0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" },

  // WETH - Wrapped Ethereum on non-Ethereum chains
  { decimals: 18, identifier: "ARB.WETH-0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" },
  { decimals: 18, identifier: "BASE.WETH-0x4200000000000000000000000000000000000006" },
  { decimals: 18, identifier: "OP.WETH-0x4200000000000000000000000000000000000006" },
  { decimals: 18, identifier: "POL.WETH-0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619" },
  { decimals: 18, identifier: "AVAX.WETH-0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB" },
  { decimals: 18, identifier: "BSC.ETH-0x2170Ed0880ac9A755fd29B2688956BD959F933F8" },

  // DAI - Popular decentralized stablecoin
  { decimals: 18, identifier: "ETH.DAI-0x6B175474E89094C44Da98b954EedeAC495271d0F" },
  { decimals: 18, identifier: "ARB.DAI-0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1" },
  { decimals: 18, identifier: "OP.DAI-0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1" },
  { decimals: 18, identifier: "POL.DAI-0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063" },
  { decimals: 18, identifier: "AVAX.DAI-0xd586E7F844cEa2F87f50152665BCbc2C279D8d70" },

  // Liquid staking tokens
  { decimals: 18, identifier: "ETH.wstETH-0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0" },
  { decimals: 18, identifier: "ARB.wstETH-0x5979D7b546E38E414F7E9822514be443A4800529" },
  { decimals: 18, identifier: "ETH.rETH-0xae78736Cd615f374D3085123A210448E74Fc6393" },
  { decimals: 18, identifier: "ARB.rETH-0xEC70Dcb4A1EFa46b8F2D97C310C9C4790ba5ffA8" },
  { decimals: 18, identifier: "BASE.cbETH-0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22" },
  { decimals: 18, identifier: "ARB.cbETH-0x1DEBd73E752bEaF79865Fd6446b0c970EaE7732f" },

  // Major DeFi tokens on Ethereum
  { decimals: 18, identifier: "ETH.AAVE-0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9" },
  { decimals: 18, identifier: "ETH.LINK-0x514910771AF9Ca656af840dff83E8264EcF986CA" },
  { decimals: 18, identifier: "ETH.UNI-0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984" },
  { decimals: 18, identifier: "ETH.MKR-0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2" },
  { decimals: 18, identifier: "ETH.CRV-0xD533a949740bb3306d119CC777fa900bA034cd52" },
  { decimals: 18, identifier: "ETH.SNX-0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F" },
  { decimals: 18, identifier: "ETH.COMP-0xc00e94Cb662C3520282E6f5717214004A7f26888" },
  { decimals: 18, identifier: "ETH.BAL-0xba100000625a3754423978a60c9317c58a424e3D" },
  { decimals: 18, identifier: "ETH.LDO-0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32" },

  // Arbitrum specific tokens
  { decimals: 18, identifier: "ARB.ARB-0x912ce59144191c1204e64559fe8253a0e49e6548" },
  { decimals: 18, identifier: "ARB.GMX-0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a" },
  { decimals: 18, identifier: "ARB.MAGIC-0x539bde0d7dbd336b79148aa742883198bbf60342" },

  // Optimism specific tokens
  { decimals: 18, identifier: "OP.OP-0x4200000000000000000000000000000000000042" },

  // Base specific tokens
  { decimals: 18, identifier: "BASE.BRETT-0x532f27101965dd16442e59d40670faf5ebb142e4" },

  // BSC popular tokens
  { decimals: 18, identifier: "BSC.BTCB-0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c" },
  { decimals: 18, identifier: "BSC.BUSD-0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56" },
  { decimals: 18, identifier: "BSC.CAKE-0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82" },

  // Solana popular tokens
  { decimals: 6, identifier: "SOL.USDC-EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  { decimals: 6, identifier: "SOL.USDT-Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" },

  // Additional high-volume tokens
  { decimals: 18, identifier: "ETH.PEPE-0x6982508145454Ce325dDbE47a25d4ec3d2311933" },
  { decimals: 18, identifier: "ETH.SHIB-0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE" },
  { decimals: 18, identifier: "ETH.APE-0x4d224452801ACEd8B2F0aebE155379bb5D594381" },
  { decimals: 18, identifier: "ETH.GRT-0xc944E90C64B2c07662A292be6244BDf05Cda44a7" },
  { decimals: 18, identifier: "ETH.FXS-0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0" },
  { decimals: 18, identifier: "ETH.FRAX-0x853d955aCEf822Db058eb8505911ED77F175b99e" },
  { decimals: 18, identifier: "ETH.LUSD-0x5f98805A4E8be255a32880FDeC7F6728C6568bA0" },
];
