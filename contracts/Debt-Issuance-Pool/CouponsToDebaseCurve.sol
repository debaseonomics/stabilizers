// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import "./lib/ABDKMathQuad.sol";

contract CouponsToDebaseCurve {
    bytes16 private MINUS_ONE = 0xbfff0000000000000000000000000000;
    bytes16 private ONE = 0x3fff0000000000000000000000000000;
    bytes16 private TWO = 0x40000000000000000000000000000000;
    bytes16 private SQRT_TWO_PI = 0x400040d931fee3b2061deb32699c0423;
    bytes16 private TENE18 = 0x403abc16d674ec800000000000000000;

    function calculateCouponsToDebase(
        uint256 couponsPerEpoch_,
        uint256 priceDelta_,
        bytes16 mean_,
        bytes16 oneDivDeviationSqrtTwoPi_,
        bytes16 twoDeviationSquare_
    ) public view returns (uint256) {
        bytes16 couponsPerEpoch = ABDKMathQuad.fromUInt(couponsPerEpoch_);
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
                    couponsPerEpoch
                )
            );
    }
}
