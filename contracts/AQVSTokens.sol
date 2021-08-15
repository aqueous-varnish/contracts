// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/math/Math.sol";

contract AQVSTokens is Ownable, ERC1155 {
  using SafeMath for uint256;

  constructor(string memory uri) ERC1155(uri) {}

  function mint(address creator, uint256 id, uint256 supply) public onlyOwner {
    _mint(creator, id, supply, "");
  }

  function isApprovedForAll(
    address _tokenOwner,
    address _operator
  ) public override view returns (bool) {
    if (_msgSender() == owner()) {
      return true;
    }
    return ERC1155.isApprovedForAll(_tokenOwner, _operator);
  }
}
