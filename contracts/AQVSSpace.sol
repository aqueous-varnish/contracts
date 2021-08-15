// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract AQVSSpace is Ownable {
  using SafeMath for uint256;

  uint256 public supply;
  uint256 public spaceCapacityInBytes;
  uint256 public accessPriceInWei;
  address public creator;
  bool public purchasable;

  modifier onlyCreator() {
    require(creator == _msgSender(), "only_creator");
    _;
  }

  function buy() public payable returns (bool) {
    return true;
  }

  function release() public onlyCreator {
    (bool success, ) = payable(creator).call{ value: address(this).balance }("");
    require(success, "failed_to_release");
  }

  function releaseTo(address to) public onlyCreator {
    (bool success, ) = payable(to).call{ value: address(this).balance }("");
    require(success, "failed_to_release");
  }

  constructor(
    uint256 _supply,
    uint256 _spaceCapacityInBytes,
    uint256 _accessPriceInWei,
    bool _purchasable,
    address _creator
  ) {
    supply = _supply;
    spaceCapacityInBytes = _spaceCapacityInBytes;
    accessPriceInWei = _accessPriceInWei;
    purchasable = _purchasable;

    creator = _creator;
  }

  function setAccessPriceInWei(uint256 _accessPriceInWei) public onlyCreator {
    accessPriceInWei = _accessPriceInWei;
  }

  function setPurchasable(bool _purchasable) public onlyCreator {
    purchasable = _purchasable;
  }

  function _addSpaceCapacityInBytes(
    uint256 additionalSpaceCapacityInBytes
  ) public onlyOwner {
    spaceCapacityInBytes = spaceCapacityInBytes + additionalSpaceCapacityInBytes;
  }
}
