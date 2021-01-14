// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import "./lib/ABDKMathQuad.sol";

contract Curve {
    bytes16 private MINUS_ONE = 0xbfff0000000000000000000000000000;
    bytes16 private TENE18 = 0x403abc16d674ec800000000000000000;

    function getCurvePoint(
        uint256 coupons_,
        uint256 priceDelta_,
        bytes16 mean_,
        bytes16 oneDivDeviationSqrtTwoPi_,
        bytes16 twoDeviationSquare_
    ) public view returns (uint256) {
        bytes16 coupons = ABDKMathQuad.fromUInt(coupons_);
        bytes16 priceDelta =
            ABDKMathQuad.div(ABDKMathQuad.fromUInt(priceDelta_), TENE18);

        bytes16 res1 = ABDKMathQuad.sub(ABDKMathQuad.ln(priceDelta), mean_);

        bytes16 res2 =
            ABDKMathQuad.mul(
                MINUS_ONE,
                ABDKMathQuad.div(
                    ABDKMathQuad.mul(res1, res1),
                    twoDeviationSquare_
                )
            );

        return
            ABDKMathQuad.toUInt(
                ABDKMathQuad.mul(
                    ABDKMathQuad.mul(
                        oneDivDeviationSqrtTwoPi_,
                        ABDKMathQuad.exp(res2)
                    ),
                    coupons
                )
            );
    }
}
