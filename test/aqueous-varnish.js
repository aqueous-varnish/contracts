const { accounts, contract, web3 } = require('@openzeppelin/test-environment');
const BN = require('bn.js');
const chai = require('chai');

chai.use(require('chai-bn')(BN));
const { expect } = chai;
const { toWei, fromWei, toBN } = web3.utils;

const AQVSTokens = contract.fromArtifact('AQVSTokens');
const AqueousVarnish = contract.fromArtifact('AQVS');
const AQVSSpace = contract.fromArtifact('AQVSSpace');
const FIVE_MB = 5 * 1000 * 1000;

const URI = 'https://mocha.aqueousvarni.sh/space-metadata/{id}';

describe("Aqueous Varnish", async () => {
  const [deployer, ...others] = accounts;

  beforeEach(async function () {
    this.contract = await AqueousVarnish.new({ from: deployer });
    await this.contract.init(URI, { from: deployer });
  });

  it('only deployer can set AQVS#weiCostPerStorageByte', async function () {
    const other = others[0];

    try {
      await this.contract.setWeiCostPerStorageByte('3100000000', {
        from: other,
      });
    } catch(e) {
      expect(e.reason).to.equal('Ownable: caller is not the owner');
    }

    expect(await this.contract.weiCostPerStorageByte()).to.be.bignumber.equal('2100000000');
    await this.contract.setWeiCostPerStorageByte('3100000000', {
      from: deployer,
    });
    expect(await this.contract.weiCostPerStorageByte()).to.be.bignumber.equal('3100000000');
  });

  it('deployer can release funds with AQVS#release', async function () {
    const creator = others[0];
    expect(toBN(await web3.eth.getBalance(this.contract.address))).to.be.bignumber.equal(toBN(0));

    const mintingCost = await this.contract.weiCostToMintSpace(FIVE_MB);
    const creatorInitialBalance = toBN(await web3.eth.getBalance(creator));
    const deployerInitialBalance = toBN(await web3.eth.getBalance(deployer));

    const tx1 = await this.contract.mintSpace(1, FIVE_MB, toWei('1.1', 'ether'), false, {
      from: creator,
      value: mintingCost
    });
    const tx1GasUsed = toBN(tx1.receipt.cumulativeGasUsed);
    const tx1GasPrice = toBN((await web3.eth.getTransaction(tx1.tx)).gasPrice);
    const tx1CostInWei = tx1GasPrice.mul(tx1GasUsed);

    const creatorAfterBalance = toBN(await web3.eth.getBalance(creator));
    expect(toBN(await web3.eth.getBalance(this.contract.address))).to.be.bignumber.equal(mintingCost);
    expect(creatorInitialBalance.sub(creatorAfterBalance))
      .to.be.bignumber.equal(mintingCost.add(tx1CostInWei));

    // Do the release
    const tx2 = await this.contract.release({
      from: deployer,
    });
    const tx2GasUsed = toBN(tx2.receipt.gasUsed);
    const tx2GasPrice = toBN((await web3.eth.getTransaction(tx2.tx)).gasPrice);
    const tx2CostInWei = tx2GasPrice.mul(tx2GasUsed);

    expect(toBN(await web3.eth.getBalance(this.contract.address))).to.be.bignumber.equal(toBN(0));
    expect(toBN(await web3.eth.getBalance(deployer)))
      .to.be.bignumber.equal(deployerInitialBalance.add(mintingCost).sub(tx2CostInWei));
  });

  it('non-deployer can not release AQVS#release', async function () {
    const creator = others[0];
    try {
      await this.contract.release({
        from: creator,
      });
    } catch(e) {
      expect(e.reason).to.equal('Ownable: caller is not the owner');
    }
  });

  it('creator can mint an AQVSSpace with AQVS#mint', async function () {
    // TODO: Test bad value sent
    // TODO: Ensure this scales with supply?
    const creator = others[0];
    const mintingCost = await this.contract.weiCostToMintSpace(FIVE_MB);
    const tx1 = await this.contract.mintSpace(1, FIVE_MB, toWei('1.1', 'ether'), false, {
      from: creator,
      value: mintingCost
    });
    const mintEvent = tx1.logs.find(l => l.event === "DidMintSpace");
    expect(mintEvent.args.spaceId.toString()).to.equal('1');
  });

  it('only creator can increase AQVSSpace#spaceCapacityInBytes with AQVS#addSpaceCapacityInBytes', async function () {
    const creator = others[0];
    const other = others[1];

    const mintingCost = await this.contract.weiCostToMintSpace(FIVE_MB);
    const tx1 = await this.contract.mintSpace(1, FIVE_MB, toWei('1.1', 'ether'), false, {
      from: creator,
      value: mintingCost
    });
    const spaceId = tx1.logs.find(l => l.event === "DidMintSpace").args.spaceId.toNumber();
    const spaceContract = await AQVSSpace.at(
      tx1.logs.find(l => l.event === "DidMintSpace").args.spaceAddress
    );

    expect(await spaceContract.spaceCapacityInBytes()).to.be.bignumber.equal(toBN(FIVE_MB));

    try {
      await this.contract.addSpaceCapacityInBytes(spaceId, FIVE_MB, {
        from: other,
        value: mintingCost
      });
    } catch(e) {
      expect(e.reason).to.equal('only_creator');
    }

    await this.contract.addSpaceCapacityInBytes(spaceId, FIVE_MB, {
      from: creator,
      value: mintingCost
    });
    expect(await spaceContract.spaceCapacityInBytes()).to.be.bignumber.equal(toBN(FIVE_MB).add(toBN(FIVE_MB)));
  });

  it('only the creator can set AQVSSpace#setAccessPriceInWei', async function () {
    const creator = others[0];
    const other = others[1];

    const mintingCost = await this.contract.weiCostToMintSpace(FIVE_MB);
    const tx1 = await this.contract.mintSpace(1, FIVE_MB, toWei('1.1', 'ether'), false, {
      from: creator,
      value: mintingCost
    });
    const spaceContract = await AQVSSpace.at(
      tx1.logs.find(l => l.event === "DidMintSpace").args.spaceAddress
    );

    try {
      await spaceContract.setAccessPriceInWei(toWei('3', 'ether'), {
        from: other
      });
    } catch (e) {
      expect(e.reason).to.equal('only_creator');
    }

    await spaceContract.setAccessPriceInWei(toWei('3', 'ether'), {
      from: creator
    });
    expect(await spaceContract.accessPriceInWei()).to.be.bignumber.equal(toWei('3', 'ether'));
  });

  it('only creator can set AQVSSpace#setPurchasable', async function () {
    const creator = others[0];
    const other = others[1];

    const mintingCost = await this.contract.weiCostToMintSpace(FIVE_MB);
    const tx1 = await this.contract.mintSpace(1, FIVE_MB, toWei('1.1', 'ether'), false, {
      from: creator,
      value: mintingCost
    });
    const spaceContract = await AQVSSpace.at(
      tx1.logs.find(l => l.event === "DidMintSpace").args.spaceAddress
    );

    try {
      await spaceContract.setPurchasable(true, {
        from: other
      });
    } catch (e) {
      expect(e.reason).to.equal('only_creator');
    }

    expect(await spaceContract.purchasable()).to.equal(false);
    await spaceContract.setPurchasable(true, {
      from: creator
    });
    expect(await spaceContract.purchasable()).to.equal(true);
  });

  it('only creator can use AQVS#giftSpaceAccess', async function () {
    const creator = others[0];
    const giftee = others[1];
    const other = others[2];

    const mintingCost = await this.contract.weiCostToMintSpace(FIVE_MB);
    const tx1 = await this.contract.mintSpace(1, FIVE_MB, toWei('1.1', 'ether'), false, {
      from: creator,
      value: mintingCost
    });
    const spaceId = tx1.logs.find(l => l.event === "DidMintSpace").args.spaceId.toNumber();

    try {
      await this.contract.giftSpaceAccess(spaceId, giftee, {
        from: other
      });
    } catch(e) {
      expect(e.reason).to.equal('only_creator');
    }

    expect((await this.contract.remainingSupply(spaceId)).toNumber()).to.equal(1);
    await this.contract.giftSpaceAccess(spaceId, giftee, {
      from: creator
    });
    expect((await this.contract.remainingSupply(spaceId)).toNumber()).to.equal(0);

    const tokenContract = await AQVSTokens.at(await this.contract.tokens());
    const gifteeBalance = await tokenContract.balanceOf(giftee, spaceId);
    expect(gifteeBalance.toNumber()).to.equal(1);
  });

  it('End to End - only creator can use AQVSSpace#release', async function () {
    const creator = others[0];
    const other = others[1];

    // Mint Space
    const mintingCost = await this.contract.weiCostToMintSpace(FIVE_MB);
    const tx1 = await this.contract.mintSpace(1, FIVE_MB, toWei('1.1', 'ether'), true, {
      from: creator,
      value: mintingCost
    });
    const spaceId = tx1.logs.find(l => l.event === "DidMintSpace").args.spaceId.toNumber();
    const spaceContract = await AQVSSpace.at(
      tx1.logs.find(l => l.event === "DidMintSpace").args.spaceAddress
    );

    // Other accesses the space
    expect((await this.contract.remainingSupply(spaceId)).toNumber()).to.equal(1);
    expect((await this.contract.spaceIdsOwnedBy(other)).length).to.equal(0);
    const tx2 = await this.contract.accessSpace(spaceId, {
      from: other,
      value: toWei('1.1', 'ether')
    });
    expect((await this.contract.remainingSupply(spaceId)).toNumber()).to.equal(0);
    expect((await this.contract.spaceIdsOwnedBy(other)).length).to.equal(1);
    expect((await this.contract.spaceIdsOwnedBy(other))[0].toNumber()).to.equal(spaceId);

    const ourFee = await this.contract.spaceFees(spaceId);
    expect(toBN(await web3.eth.getBalance(spaceContract.address)))
      .to.be.bignumber.equal(toBN(toWei('1.1', 'ether')).sub(ourFee));
    expect(toBN(await web3.eth.getBalance(this.contract.address)))
      .to.be.bignumber.equal(mintingCost.add(ourFee));

    try {
      await spaceContract.release({
        from: other
      });
    } catch(e) {
      expect(e.reason).to.equal('only_creator');
    }

    const creatorInitialBalance = toBN(await web3.eth.getBalance(creator));
    const tx3 = await spaceContract.release({
      from: creator
    });
    expect(toBN(await web3.eth.getBalance(spaceContract.address))).to.be.bignumber.equal(toBN(0));
    const tx3GasUsed = toBN(tx3.receipt.cumulativeGasUsed);
    const tx3GasPrice = toBN((await web3.eth.getTransaction(tx3.tx)).gasPrice);
    const tx3CostInWei = tx3GasPrice.mul(tx3GasUsed);
    const creatorAfterBalance = toBN(await web3.eth.getBalance(creator));

    expect(creatorAfterBalance)
      .to.be.bignumber.equal(creatorInitialBalance.add(
        toBN(toWei('1.1', 'ether')).sub(ourFee).sub(tx3CostInWei)
      ));
  });

  it("a creator can not mint a space without at least 1 supply", async function () {
    const creator = others[0];
    const mintingCost = await this.contract.weiCostToMintSpace(FIVE_MB);
    try {
      await this.contract.mintSpace(0, FIVE_MB, toWei('1.1', 'ether'), false, {
        from: creator,
        value: mintingCost
      });
    } catch(e) {
      expect(e.reason).to.be.equal('supply_too_low');
    }
  });

  it("a creator can not mint a space without sending the correct ETH", async function () {
    const creator = others[0];
    try {
      await this.contract.mintSpace(1, FIVE_MB, toWei('1.1', 'ether'), false, {
        from: creator,
        value: 0
      });
    } catch(e) {
      expect(e.reason).to.be.equal('bad_payment');
    }
  });

  it("a buyer can not buy access to a space twice, or a sold-out space", async function () {
    const creator = others[0];
    const other = others[1];
    const other2 = others[2];

    // Mint Space
    const mintingCost = await this.contract.weiCostToMintSpace(FIVE_MB);
    const tx1 = await this.contract.mintSpace(1, FIVE_MB, toWei('1.1', 'ether'), true, {
      from: creator,
      value: mintingCost
    });
    const spaceId = tx1.logs.find(l => l.event === "DidMintSpace").args.spaceId.toNumber();
    const spaceContract = await AQVSSpace.at(
      tx1.logs.find(l => l.event === "DidMintSpace").args.spaceAddress
    );

    // Other accesses the space
    await this.contract.accessSpace(spaceId, {
      from: other,
      value: toWei('1.1', 'ether')
    });

    try {
      await this.contract.accessSpace(spaceId, {
        from: other,
        value: toWei('1.1', 'ether')
      });
    } catch(e) {
      expect(e.reason).to.equal('already_owns_space');
    }

    try {
      await this.contract.accessSpace(spaceId, {
        from: other2,
        value: toWei('1.1', 'ether')
      });
    } catch(e) {
      expect(e.reason).to.equal('ERC1155: insufficient balance for transfer');
    }
  });

  it("only deployer can release system fees to a specific address", async function () {
    const creator = others[0];
    const other = others[1];
    const receiver = others[2];

    // Mint Space
    const mintingCost = await this.contract.weiCostToMintSpace(FIVE_MB);
    const tx1 = await this.contract.mintSpace(1, FIVE_MB, toWei('1.1', 'ether'), true, {
      from: creator,
      value: mintingCost
    });
    const spaceId = tx1.logs.find(l => l.event === "DidMintSpace").args.spaceId.toNumber();
    const spaceContract = await AQVSSpace.at(
      tx1.logs.find(l => l.event === "DidMintSpace").args.spaceAddress
    );

    // Other accesses the space
    const tx2 = await this.contract.accessSpace(spaceId, {
      from: other,
      value: toWei('1.1', 'ether')
    });

    const ourFee = await this.contract.spaceFees(spaceId);
    expect(toBN(await web3.eth.getBalance(spaceContract.address)))
      .to.be.bignumber.equal(toBN(toWei('1.1', 'ether')).sub(ourFee));
    expect(toBN(await web3.eth.getBalance(this.contract.address)))
      .to.be.bignumber.equal(mintingCost.add(ourFee));

    try {
      await this.contract.releaseTo(receiver, {
        from: creator
      });
    } catch(e) {
      expect(e.reason).to.equal('Ownable: caller is not the owner');
    }

    const receiverInitialBalance = toBN(await web3.eth.getBalance(receiver));
    const tx3 = await this.contract.releaseTo(receiver, {
      from: deployer
    });
    expect(toBN(await web3.eth.getBalance(this.contract.address))).to.be.bignumber.equal(toBN(0));
    const receiverAfterBalance = toBN(await web3.eth.getBalance(receiver));
    expect(receiverAfterBalance)
      .to.be.bignumber.equal(receiverInitialBalance.add(mintingCost).add(ourFee));
  });

  it("a creator can not mint a space without at least 1 supply", async function () {
    const creator = others[0];
    const mintingCost = await this.contract.weiCostToMintSpace(FIVE_MB);
    try {
      await this.contract.mintSpace(0, FIVE_MB, toWei('1.1', 'ether'), false, {
        from: creator,
        value: mintingCost
      });
    } catch(e) {
      expect(e.reason).to.be.equal('supply_too_low');
    }
  });

  it("only creator can release space fees to a specific address", async function () {
    const creator = others[0];
    const other = others[1];
    const receiver = others[2];

    // Mint Space
    const mintingCost = await this.contract.weiCostToMintSpace(FIVE_MB);
    const tx1 = await this.contract.mintSpace(1, FIVE_MB, toWei('1.1', 'ether'), true, {
      from: creator,
      value: mintingCost
    });
    const spaceId = tx1.logs.find(l => l.event === "DidMintSpace").args.spaceId.toNumber();
    const spaceContract = await AQVSSpace.at(
      tx1.logs.find(l => l.event === "DidMintSpace").args.spaceAddress
    );

    // Other accesses the space
    const tx2 = await this.contract.accessSpace(spaceId, {
      from: other,
      value: toWei('1.1', 'ether')
    });

    const ourFee = await this.contract.spaceFees(spaceId);
    expect(toBN(await web3.eth.getBalance(spaceContract.address)))
      .to.be.bignumber.equal(toBN(toWei('1.1', 'ether')).sub(ourFee));
    expect(toBN(await web3.eth.getBalance(this.contract.address)))
      .to.be.bignumber.equal(mintingCost.add(ourFee));

    try {
      await spaceContract.releaseTo(receiver, {
        from: other
      });
    } catch(e) {
      expect(e.reason).to.equal('only_creator');
    }

    const receiverInitialBalance = toBN(await web3.eth.getBalance(receiver));
    const tx3 = await spaceContract.releaseTo(receiver, {
      from: creator
    });
    expect(toBN(await web3.eth.getBalance(spaceContract.address))).to.be.bignumber.equal(toBN(0));
    const receiverAfterBalance = toBN(await web3.eth.getBalance(receiver));

    expect(receiverAfterBalance)
      .to.be.bignumber.equal(receiverInitialBalance.add(
        toBN(toWei('1.1', 'ether')).sub(ourFee)
      ));
  });

  it("a creator can not mint a space without at least 1 supply", async function () {
    const creator = others[0];
    const mintingCost = await this.contract.weiCostToMintSpace(FIVE_MB);
    try {
      await this.contract.mintSpace(0, FIVE_MB, toWei('1.1', 'ether'), false, {
        from: creator,
        value: mintingCost
      });
    } catch(e) {
      expect(e.reason).to.be.equal('supply_too_low');
    }
  });

  it("a creator can not mint a space without sending the correct ETH", async function () {
    const creator = others[0];
    try {
      await this.contract.mintSpace(1, FIVE_MB, toWei('1.1', 'ether'), false, {
        from: creator,
        value: 0
      });
    } catch(e) {
      expect(e.reason).to.be.equal('bad_payment');
    }
  });

  it("Can build a URI for the token", async function () {
    const tokens = await AQVSTokens.at(await this.contract.tokens());
    const uri = await tokens.uri(1);
    expect(uri).to.be.equal(URI);
  });
});
