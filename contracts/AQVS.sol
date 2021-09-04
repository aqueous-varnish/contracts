// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./AQVSSpace.sol";

contract AQVS is OwnableUpgradeable {
  using SafeMath for uint256;

  event DidMintSpace(uint256 spaceId, address spaceAddress);
  event DidAccessSpace(uint256 spaceId, address spaceAddress);
  event DidGiftSpaceAccess(uint256 spaceId, address spaceAddress);

  string public baseURI;
  uint256 public spaceCount;
  uint256 public weiCostPerStorageByte;
  mapping (uint256 => address) public spacesById;
  mapping (address => address[]) public spacesByCreator;
  mapping (address => address[]) public spacesByAccessor;

  function init(
    string memory _baseURI
  ) public initializer {
    OwnableUpgradeable.__Ownable_init();
    spaceCount = 0;
    baseURI = _baseURI;
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
  ) public payable returns (uint256) {
    require(
       msg.value >= weiCostToMintSpace(spaceCapacityInBytes),
      "bad_payment"
    );
    require(
      accessPriceInWei >= estimateSpaceFees(supply, spaceCapacityInBytes, accessPriceInWei),
      "price_too_low"
    );

    address creator = _msgSender();
    spaceCount++;

    // TODO: Name & Code
    try new AQVSSpace("foo", "FOO", spaceCount, supply, spaceCapacityInBytes, accessPriceInWei, purchasable, creator, baseURI)
      returns (AQVSSpace aqvsSpace)
    {
      spacesById[spaceCount] = address(aqvsSpace);
      spaceIdsByCreator[creator].push(spaceCount);
      emit DidMintSpace(spaceCount, address(aqvsSpace));
    } catch {
      revert("make_space_failed");
    }

    return spaceCount;
  }

  function accessSpace(
    uint256 spaceId
  ) public payable returns (bool) {
    AQVSSpace space = AQVSSpace(spacesById[spaceId]);
    require(space.creator() != address(0), "space_must_exist");
    require(msg.value >= space.accessPriceInWei(), "bad_payment");
    require(true == space.purchasable(), "not_purchasable");

    address buyer = _msgSender();
    require(space.balanceOf(buyer) == 0, "already_owns_space");

    space._grantAccess(buyer);
    uint256 fee = spaceFees(spaceId);
    uint256 remainder = SafeMath.sub(msg.value, fee);
    bool success = space.pay{ value: remainder }();
    require(success, "failed_to_pay_creator");
    spaceIdsByAccessor[buyer].push(spaceId);
    emit DidAccessSpace(spaceId, address(space));
    return true;
  }

  function addSpaceCapacityInBytes(
    uint256 spaceId,
    uint256 additionalSpaceCapacityInBytes
  ) public payable returns (bool) {
    AQVSSpace space = AQVSSpace(spacesById[spaceId]);
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
    uint256 spaceId,
    address giftee
  ) public returns (bool) {
    AQVSSpace space = AQVSSpace(spacesById[spaceId]);
    require(space.creator() != address(0), "space_must_exist");
    require(space.creator() == _msgSender(), "only_creator");

    require(space.balanceOf(giftee) == 0, "already_owns_space");
    space._grantAccess(giftee);
    spaceIdsByAccessor[giftee].push(spaceId);
    emit DidGiftSpaceAccess(spaceId, address(space));
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
    uint256 spaceId
  ) public view returns (uint256) {
    AQVSSpace space = AQVSSpace(spacesById[spaceId]);
    require(space.creator() != address(0), "space_must_exist");
    return space.remainingSupply();
  }

  function spaceFees(
    uint256 spaceId
  ) public view returns (uint256) {
    AQVSSpace space = AQVSSpace(spacesById[spaceId]);
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

  function spaceIdsCreatedBy(
    address creator
  ) public view returns (uint256[] memory) {
    return spaceIdsByCreator[creator];
  }

  function spaceIdsOwnedBy(
    address buyer
  ) public view returns (uint256[] memory) {
    return spaceIdsByAccessor[buyer];
  }
}
