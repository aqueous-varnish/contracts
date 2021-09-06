const { deployProxy } = require('@openzeppelin/truffle-upgrades');
const AQVSController = artifacts.require('./AQVSController.sol');

module.exports = async function(deployer, network) {
  await deployProxy(
    AQVSController,
    [network],
    {
      deployer,
      initializer: 'init',
      kind: 'transparent'
    }
  );
}
