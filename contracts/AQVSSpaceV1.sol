// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./AddressToString.sol";

contract AQVSSpaceV1 is Ownable, ERC721 {
  using SafeMath for uint256;
  using Strings for uint256;
  using AddressToString for address;

  uint256 public supply;
  uint256 public spaceCapacityInBytes;
  uint256 public accessPriceInWei;
  address public creator;
  bool public purchasable;

  function version() public pure returns (string memory) {
    return "V1";
  }

  modifier onlyCreator() {
    require(creator == _msgSender(), "only_creator");
    _;
  }

  function pay() public payable returns (bool) {
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
    string memory _name,
    string memory _symbol,
    uint256 _supply,
    uint256 _spaceCapacityInBytes,
    uint256 _accessPriceInWei,
    bool _purchasable,
    address _creator,
    string memory _proxy
  ) ERC721(_name, _symbol) {
    supply = _supply;
    spaceCapacityInBytes = _spaceCapacityInBytes;
    accessPriceInWei = _accessPriceInWei;
    purchasable = _purchasable;
    creator = _creator;
    _setBaseURI(
      string(abi.encodePacked(_proxy, "space-metadata/", address(this).toString(), "/"))
    );
  }

  function _grantAccess(address to) public onlyOwner {
    uint256 totalSupply = totalSupply();
    require(totalSupply < supply, "sold_out");
    require(balanceOf(to) == 0, "already_owns_space");
    _safeMint(to, SafeMath.add(totalSupply, 1));
  }

  function remainingSupply() public view returns (uint256) {
    return SafeMath.sub(supply, totalSupply());
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
