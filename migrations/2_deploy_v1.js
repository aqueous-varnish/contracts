const { deployProxy } = require('@openzeppelin/truffle-upgrades');
const AQVS = artifacts.require('./AQVS.sol');

module.exports = async function(deployer, network) {
  let uri = "http://localhost:3000/token-metadata/{id}";
  if (network === "ropsten") {
    let uri = "https://ropsten.aqueousvarni.sh/token-metadata/{id}";
  } else if (network === "mainnet") {
    let uri = "https://mainnet.aqueousvarni.sh/token-metadata/{id}";
  }

  await deployProxy(
    AQVS,
    [uri],
    {
      deployer,
      initializer: 'init',
      kind: 'transparent'
    }
  );
}
