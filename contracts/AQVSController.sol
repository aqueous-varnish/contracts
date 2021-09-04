// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./AQVSSpaceV1.sol";

contract AQVSController is OwnableUpgradeable {
  using SafeMath for uint256;

  event DidMintSpace(address spaceAddress);
  event DidAccessSpace(address spaceAddress);
  event DidGiftSpaceAccess(address spaceAddress);

  string public network;
  string public proxy;
  uint256 public weiCostPerStorageByte;
  mapping (address => address[]) public spacesByCreator;
  mapping (address => address[]) public spacesByAccessor;

  function init(
    string memory _network
  ) public initializer {
    OwnableUpgradeable.__Ownable_init();
    network = _network;
    proxy = string(abi.encodePacked("https://", _network, ".aqueousvarni.sh/"));
    // At an ETH price for ~$3200, a space of ~5mb will be
    // around $34 USD. Given we're paying for data transfer
    // and CDN costs for perpetuity, that feels about right.
    weiCostPerStorageByte = 2100000000;
  }

  function release() public onlyOwner {
    (bool success, ) = payable(owner()).call{ value: address(this).balance }("");
    require(success, "failed_to_release");
  }

  function releaseTo(address to) public onlyOwner {
    (bool success, ) = payable(to).call{ value: address(this).balance }("");
    require(success, "failed_to_release");
  }

  function setWeiCostPerStorageByte(
    uint256 _weiCostPerStorageByte
  ) public onlyOwner {
    weiCostPerStorageByte = _weiCostPerStorageByte;
  }

  function mintSpace(
    uint256 supply,
    uint256 spaceCapacityInBytes,
    uint256 accessPriceInWei,
    bool purchasable
  ) public payable {
    require(
       msg.value >= weiCostToMintSpace(spaceCapacityInBytes),
      "bad_payment"
    );
    require(
      accessPriceInWei >= estimateSpaceFees(supply, spaceCapacityInBytes, accessPriceInWei),
      "price_too_low"
    );

    address creator = _msgSender();
    try new AQVSSpaceV1(
      "Aqueous Varnish V1",
      "AQVS-V1",
      supply,
      spaceCapacityInBytes,
      accessPriceInWei,
      purchasable,
      creator,
      proxy
    )
      returns (AQVSSpaceV1 space)
    {
      spacesByCreator[creator].push(address(space));
      emit DidMintSpace(address(space));
    } catch {
      revert("make_space_failed");
    }
  }

  function accessSpace(
    address spaceAddress
  ) public payable {
    AQVSSpaceV1 space = AQVSSpaceV1(spaceAddress);
    require(space.creator() != address(0), "space_must_exist");
    require(msg.value >= space.accessPriceInWei(), "bad_payment");
    require(true == space.purchasable(), "not_purchasable");

    address buyer = _msgSender();
    require(space.balanceOf(buyer) == 0, "already_owns_space");

    space._grantAccess(buyer);
    uint256 fee = spaceFees(spaceAddress);
    uint256 remainder = SafeMath.sub(msg.value, fee);
    bool success = space.pay{ value: remainder }();
    require(success, "failed_to_pay_creator");
    spacesByAccessor[buyer].push(address(space));
    emit DidAccessSpace(address(space));
  }

  function addSpaceCapacityInBytes(
    address spaceAddress,
    uint256 additionalSpaceCapacityInBytes
  ) public payable returns (bool) {
    AQVSSpaceV1 space = AQVSSpaceV1(spaceAddress);
    require(space.creator() != address(0), "space_must_exist");
    require(space.creator() == _msgSender(), "only_creator");
    require(
      weiCostToMintSpace(additionalSpaceCapacityInBytes) >= msg.value,
      "bad_payment"
    );
    space._addSpaceCapacityInBytes(additionalSpaceCapacityInBytes);
    return true;
  }

  function giftSpaceAccess(
    address spaceAddress,
    address giftee
  ) public returns (bool) {
    AQVSSpaceV1 space = AQVSSpaceV1(spaceAddress);
    require(space.creator() != address(0), "space_must_exist");
    require(space.creator() == _msgSender(), "only_creator");

    require(space.balanceOf(giftee) == 0, "already_owns_space");
    space._grantAccess(giftee);
    spacesByAccessor[giftee].push(address(space));
    emit DidGiftSpaceAccess(address(space));
    return true;
  }

  /* Views */
  function estimateSpaceFees(
    uint256 supply,
    uint256 spaceCapacityInBytes,
    uint256 accessPriceInWei
  ) public view returns (uint256) {
    require(supply > 0, "supply_too_low");
    require(supply < 1000000, "supply_too_high");
    require(spaceCapacityInBytes > 255999, "space_too_small");
    require(spaceCapacityInBytes < 100000000001, "space_too_big");
    return (
      spaceCapacityInBytes * weiCostPerStorageByte
    ) + SafeMath.div(accessPriceInWei, 100);
  }

  function remainingSupply(
    address spaceAddress
  ) public view returns (uint256) {
    AQVSSpaceV1 space = AQVSSpaceV1(spaceAddress);
    require(space.creator() != address(0), "space_must_exist");
    return space.remainingSupply();
  }

  function spaceFees(
    address spaceAddress
  ) public view returns (uint256) {
    AQVSSpaceV1 space = AQVSSpaceV1(spaceAddress);
    require(space.creator() != address(0), "space_must_exist");
    return estimateSpaceFees(
      space.supply(),
      space.spaceCapacityInBytes(),
      space.accessPriceInWei()
    );
  }

  function weiCostToMintSpace(
    uint256 spaceCapacityInBytes
  ) public view returns (uint256) {
    return spaceCapacityInBytes * weiCostPerStorageByte;
  }

  function spacesCreatedBy(
    address creator
  ) public view returns (address[] memory) {
    return spacesByCreator[creator];
  }

  function spacesOwnedBy(
    address owner
  ) public view returns (address[] memory) {
    return spacesByAccessor[owner];
  }
}
