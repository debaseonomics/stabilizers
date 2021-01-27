import { ethers, network } from 'hardhat';
import { BigNumber, Signer } from 'ethers';
import { expect } from 'chai';

import { formatEther, parseEther, parseUnits } from 'ethers/lib/utils';

import BurnPoolArtifact from '../../artifacts/contracts/Debt-Issuance-Pool/BurnPool.sol/BurnPool.json';
import OracleArtifact from '../../artifacts/contracts/Debt-Issuance-Pool/Oracle.sol/Oracle.json';
import DebasePolicyArtifact from '../../artifacts/contracts/Debt-Issuance-Pool/Mock/DebasePolicy.sol/DebasePolicy.json';
import ERC20Artifact from '../../artifacts/contracts/Debt-Issuance-Pool/Mock/Debase.sol/ERC20.json';
import DebaseArtifact from '../../artifacts/contracts/Debt-Issuance-Pool/Mock/Debase.sol/Debase.json';
import UniswapV2Router02Artifact from '../../artifacts/contracts/Debt-Issuance-Pool/Mock/UniswapV2Router02.sol/UniswapV2Router02.json';

import { BurnPoolFactory } from '../../typechain/BurnPoolFactory';
import { OracleFactory } from '../../typechain/OracleFactory';

import { BurnPool } from '../../typechain/BurnPool';
import { Oracle } from '../../typechain/Oracle';
import { Erc20 } from '../../typechain/Erc20';
import { DebasePolicy } from '../../typechain/DebasePolicy';
import { UniswapV2Router02 } from '../../typechain/UniswapV2Router02';
import { Debase } from '../../typechain/Debase';

describe('Debt Issuance Pool', () => {
	let accounts: Signer[];
	let burnPoolFactory: BurnPoolFactory;
	let oracleFactory: OracleFactory;
	let debasePolicy: DebasePolicy;
	let uniswapV2Router: UniswapV2Router02;
	let dai: Erc20;
	let daiUser: Erc20;
	let debase: Debase;
	let debaseUser: Debase;
	let account1: string;

	before(async function() {
		accounts = await ethers.getSigners();
		account1 = await accounts[0].getAddress();

		oracleFactory = (new ethers.ContractFactory(
			OracleArtifact.abi,
			OracleArtifact.bytecode,
			accounts[0]
		) as any) as OracleFactory;

		await network.provider.request({
			method: 'hardhat_impersonateAccount',
			params: [ '0xf038c1cfadace2c0e5963ab5c0794b9575e1d2c2' ]
		});

		await network.provider.request({
			method: 'hardhat_impersonateAccount',
			params: [ '0x6B175474E89094C44Da98b954EedeAC495271d0F' ]
		});

		await network.provider.request({
			method: 'hardhat_impersonateAccount',
			params: [ '0x989Edd2e87B1706AB25b2E8d9D9480DE3Cc383eD' ]
		});

		let multiSig = await ethers.provider.getSigner('0xf038c1cfadace2c0e5963ab5c0794b9575e1d2c2');
		let daiSig = await ethers.provider.getSigner('0x6B175474E89094C44Da98b954EedeAC495271d0F');
		let policySig = await ethers.provider.getSigner('0x989Edd2e87B1706AB25b2E8d9D9480DE3Cc383eD');

		burnPoolFactory = (new ethers.ContractFactory(
			BurnPoolArtifact.abi,
			BurnPoolArtifact.bytecode,
			policySig
		) as any) as BurnPoolFactory;

		debasePolicy = new ethers.Contract(
			'0x989Edd2e87B1706AB25b2E8d9D9480DE3Cc383eD',
			DebasePolicyArtifact.abi,
			multiSig
		) as DebasePolicy;

		uniswapV2Router = new ethers.Contract(
			'0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
			UniswapV2Router02Artifact.abi,
			accounts[0]
		) as UniswapV2Router02;

		debase = new ethers.Contract(
			'0x9248c485b0B80f76DA451f167A8db30F33C70907',
			DebaseArtifact.abi,
			accounts[0]
		) as Debase;

		debaseUser = debase.connect(accounts[0]);

		dai = new ethers.Contract('0x6B175474E89094C44Da98b954EedeAC495271d0F', ERC20Artifact.abi, daiSig) as Erc20;
		daiUser = dai.connect(accounts[0]);

		await dai.transfer(account1, parseEther('90000'));
		daiUser.approve(uniswapV2Router.address, parseEther('100'));

		await uniswapV2Router.swapExactTokensForTokens(
			parseEther('100'),
			parseEther('1'),
			[ '0x6B175474E89094C44Da98b954EedeAC495271d0F', '0x9248c485b0B80f76DA451f167A8db30F33C70907' ],
			account1,
			1621000900
		);
		await debasePolicy.setStabilizerPoolEnabled(1, false);
		await debasePolicy.setStabilizerPoolEnabled(2, false);
	});

	describe('Deploy and Initialize', () => {
		let burnPool: BurnPool;
		let burnPoolUser: BurnPool;
		let oracle: Oracle;

		const debaseAddress = '0x9248c485b0B80f76DA451f167A8db30F33C70907';
		const daiAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
		const policy = '0x989Edd2e87B1706AB25b2E8d9D9480DE3Cc383eD';
		const burnPool1 = '0xF4168cc431e9a8310e595dB9F7E2564cC96F5D51';
		const burnPool2 = '0xf5cB771023706Ca566eA6128b88e03A262737479';
		const multiSigAddress = '0xf038c1cfadace2c0e5963ab5c0794b9575e1d2c2';

		const epochs = 2;
		const oraclePeriod = 3;
		const curveShifter = 0;
		const initialRewardShare = parseUnits('5', 17);
		const multiSigReward = 0;
		const mean = '0x00000000000000000000000000000000';
		const deviation = '0x3fff609aa6ab2c4acd8e2f11c9afa275';
		const oneDivDeviationSqrtTwoPi = '0x3ffd28981c19c08dc42a6e8e83ae45e6';

		const twoDeviationSquare = '0x4000e5a9a7c429bb0f601a46fe1645e7';

		before(async function() {
			burnPool = await burnPoolFactory.deploy();
			burnPoolUser = burnPool.connect(accounts[0]);
			oracle = await oracleFactory.deploy(debaseAddress, daiAddress, burnPool.address);

			await burnPool.initialize(
				debaseAddress,
				oracle.address,
				policy,
				burnPool1,
				burnPool2,
				epochs,
				oraclePeriod,
				curveShifter,
				initialRewardShare,
				multiSigAddress,
				multiSigReward,
				mean,
				deviation,
				oneDivDeviationSqrtTwoPi,
				twoDeviationSquare
			);

			await burnPool.transferOwnership(multiSigAddress);
			await debasePolicy.addNewStabilizerPool(burnPool.address);
			await debasePolicy.setStabilizerPoolEnabled(3, true);
		});

		describe('Oracle initialized settings check', function() {
			it('Debase address should be correct', async function() {
				expect(await oracle.debase()).eq(debaseAddress);
			});
			it('Dai address should be correct', async function() {
				expect(await oracle.dai()).eq(daiAddress);
			});
			it('Pool address should be correct', async function() {
				expect(await oracle.pool()).eq(burnPool.address);
			});
		});

		describe('Burn pool initialization', function() {
			it('Debase address should be correct', async function() {
				expect(await burnPool.debase()).eq(debaseAddress);
			});
			it('Policy address should be correct', async function() {
				expect(await burnPool.policy()).eq(policy);
			});
			it('Oracle address should be correct', async function() {
				expect(await burnPool.oracle()).eq(oracle.address);
			});
			it('Burn pool 1 address should be correct', async function() {
				expect(await burnPool.burnPool1()).eq(burnPool1);
			});
			it('Burn pool 2 address should be correct', async function() {
				expect(await burnPool.burnPool2()).eq(burnPool2);
			});
			it('Epochs should be correct', async function() {
				expect(await burnPool.epochs()).eq(epochs);
			});
			it('Oracle period should be set correctly', async function() {
				expect(await burnPool.oraclePeriod()).eq(oraclePeriod);
			});
			it('Curve shifter should be set correctly', async function() {
				expect(await burnPool.curveShifter()).eq(curveShifter);
			});
			it('Oracle period should be set correctly', async function() {
				expect(await burnPool.initialRewardShare()).eq(initialRewardShare);
			});
			it('Curve shifter should be set correctly', async function() {
				expect(await burnPool.multiSigRewardShare()).eq(multiSigReward);
			});
			it('Mean should be set correctly', async function() {
				expect(await burnPool.mean()).eq(mean);
			});
			it('Deviation should be set correctly', async function() {
				expect(await burnPool.deviation()).eq(deviation);
			});
			it('One dic deviation sqrt two pi should be set correctly', async function() {
				expect(await burnPool.oneDivDeviationSqrtTwoPi()).eq(oneDivDeviationSqrtTwoPi);
			});
			it('Two deviation square should be set correctly', async function() {
				expect(await burnPool.twoDeviationSquare()).eq(twoDeviationSquare);
			});

			describe('Basic Functionality', () => {
				describe('When first rebase has not fired', () => {
					it('Users should be not able to buy coupons', async function() {
						await debaseUser.approve(burnPool.address, parseEther('10'));
						await expect(burnPoolUser.buyCoupons(parseEther('10'))).to.be.revertedWith(
							'Can only buy coupons with last rebase was negative'
						);
					});
				});

				describe('When first rebase has been fired', () => {
					describe('For neutral supply delta rebase', () => {
						it('Stabilizer function should not emit an accrue event', async function() {
							await expect(burnPool.checkStabilizerAndGetReward(0, 10, 0, parseEther('10'))).to.not.emit(
								burnPool,
								'LogRewardsAccrued'
							);
						});
						it('Reward accrue amount should be zero', async function() {
							expect(await burnPool.rewardsAccrued()).eq(0);
						});

						it('Reward enum should be set to neutral', async function() {
							expect(await burnPool.lastRebase()).eq(1);
						});

						it('Users should not be able to buy coupons', async function() {
							await debase.approve(burnPool.address, parseEther('10'));
							await expect(burnPoolUser.buyCoupons(parseEther('10'))).to.be.revertedWith(
								'Can only buy coupons with last rebase was negative'
							);
						});
					});

					describe('For negative supply delta rebase', () => {
						it('Stabilizer function should emit new coupon cycle event', async function() {
							const rewardAmount = (await burnPool.circBalance())
								.mul(await burnPool.initialRewardShare())
								.div(parseEther('1'));

							const rewardShare = rewardAmount.mul(parseEther('1')).div(await debase.totalSupply());

							await expect(burnPool.checkStabilizerAndGetReward(-1, 10, 0, parseEther('10'))).to
								.emit(burnPool, 'LogNewCouponCycle')
								.withArgs(0, 2, rewardShare, 0, 0, 0, 0, 0, 0, 0, 0);
						});

						it('User should be able to buy coupons and emit correct transfer event', async function() {
							await debaseUser.approve(burnPool.address, parseEther('10'));
							await expect(burnPoolUser.buyCoupons(parseEther('1'))).to
								.emit(debase, 'Transfer')
								.withArgs(account1, policy, parseEther('1'));
						});
						it('User should emit update oracle event', async function() {
							await debaseUser.approve(burnPool.address, parseEther('10'));
							await expect(burnPoolUser.buyCoupons(parseEther('1'))).to.emit(
								burnPoolUser,
								'LogOraclePriceAndPeriod'
							);
						});

						it('User should not be able to buy debt when price goes higher than lower price limit', async function() {
							daiUser.approve(uniswapV2Router.address, parseEther('45000'));

							await uniswapV2Router.swapExactTokensForTokens(
								parseEther('45000'),
								parseEther('1'),
								[
									'0x6B175474E89094C44Da98b954EedeAC495271d0F',
									'0x9248c485b0B80f76DA451f167A8db30F33C70907'
								],
								account1,
								1621000900
							);
							await debaseUser.approve(burnPool.address, parseEther('10'));
							await expect(burnPoolUser.buyCoupons(parseEther('1'))).to.be.revertedWith(
								'Can only buy coupons if price is lower than lower threshold'
							);
						});

						it('User should be able buy debt when price goes back down the limit', async function() {
							debaseUser.approve(uniswapV2Router.address, parseEther('45000'));

							await uniswapV2Router.swapExactTokensForTokens(
								parseEther('45000'),
								parseEther('1'),
								[
									'0x9248c485b0B80f76DA451f167A8db30F33C70907',
									'0x6B175474E89094C44Da98b954EedeAC495271d0F'
								],
								account1,
								1621000900
							);
							await debaseUser.approve(burnPool.address, parseEther('10'));
							await expect(burnPoolUser.buyCoupons(parseEther('1'))).to.not.be.revertedWith(
								'Can only buy coupons if price is lower than lower threshold'
							);
						});
					});
					describe('For positive supply delta rebase', () => {
						let burnPoolV2: BurnPool;
						let burnPoolUserV2: BurnPool;
						let burnPoolUserMultiSig: BurnPool;
						let oracleV2: Oracle;

						before(async function() {
							let multiSig = await ethers.provider.getSigner(
								'0xf038c1cfadace2c0e5963ab5c0794b9575e1d2c2'
							);

							burnPoolV2 = await burnPoolFactory.deploy();
							burnPoolUserV2 = burnPoolV2.connect(accounts[0]);
							burnPoolUserMultiSig = burnPoolV2.connect(multiSig);
							oracleV2 = await oracleFactory.deploy(debaseAddress, daiAddress, burnPoolV2.address);

							await burnPoolV2.initialize(
								debaseAddress,
								oracleV2.address,
								policy,
								burnPool1,
								burnPool2,
								epochs,
								oraclePeriod,
								curveShifter,
								initialRewardShare,
								multiSigAddress,
								multiSigReward,
								mean,
								deviation,
								oneDivDeviationSqrtTwoPi,
								twoDeviationSquare
							);
						});

						it('Stabilizer function should emit an accrue event with correct reward amount', async function() {
							const offset = parseUnits('95', 16);
							const value = await burnPoolV2.getCurveValue(
								offset,
								mean,
								oneDivDeviationSqrtTwoPi,
								twoDeviationSquare
							);

							const currentSupply = await debase.totalSupply();
							const newSupply = currentSupply.add(parseEther('30000'));

							const expansionPercentage = newSupply
								.mul(parseEther('1'))
								.div(currentSupply)
								.sub(parseEther('1'));

							const expansionPercentageScaled = await burnPoolV2.bytes16ToUnit256(
								value,
								expansionPercentage
							);

							await expect(
								burnPoolV2.checkStabilizerAndGetReward(
									parseEther('30000'),
									10,
									parseEther('2'),
									parseEther('10000')
								)
							).to
								.emit(burnPoolV2, 'LogRewardsAccrued')
								.withArgs(expansionPercentageScaled);
						});
						it('There should be no reward cycles started', async function() {
							expect(await burnPoolV2.rewardCyclesLength()).eq(0);
						});
						it('Another Stabilizer function should emit an accrue event with correct reward amount', async function() {
							const offset = parseUnits('95', 16);
							const value = await burnPoolV2.getCurveValue(
								offset,
								mean,
								oneDivDeviationSqrtTwoPi,
								twoDeviationSquare
							);

							const currentSupply = await debase.totalSupply();
							const newSupply = currentSupply.add(parseEther('30000'));

							const expansionPercentage = newSupply
								.mul(parseEther('1'))
								.div(currentSupply)
								.sub(parseEther('1'));

							const expansionPercentageScaled = await burnPoolV2.bytes16ToUnit256(
								value,
								expansionPercentage
							);

							const rewardsAccrued = (await burnPoolV2.rewardsAccrued())
								.mul(expansionPercentageScaled)
								.div(parseEther('1'));

							await expect(
								burnPoolV2.checkStabilizerAndGetReward(
									parseEther('30000'),
									10,
									parseEther('2'),
									parseEther('10000')
								)
							).to
								.emit(burnPoolV2, 'LogRewardsAccrued')
								.withArgs(rewardsAccrued);
						});
						it('When negative rebase happens new coupon cycle should be started with the correct data', async function() {
							const cycleLen = await burnPoolV2.rewardCyclesLength();
							const epochs = await burnPoolV2.epochs();

							const rewardAmount = (await burnPoolV2.circBalance())
								.mul(await burnPoolV2.rewardsAccrued())
								.div(parseEther('1'));

							const rewardShare = rewardAmount.mul(parseEther('1')).div(await debase.totalSupply());

							await expect(
								burnPoolV2.checkStabilizerAndGetReward(-1, 10, parseEther('2'), parseEther('10000'))
							).to
								.emit(burnPoolV2, 'LogNewCouponCycle')
								.withArgs(cycleLen, epochs, rewardShare, 0, 0, 0, 0, 0, 0, 0, 0);
						});
						it('There should be a reward cycles started afterwards', async function() {
							expect(await burnPoolV2.rewardCyclesLength()).eq(1);
						});

						describe('When the next rebase is neutral happens followed by a negative ', () => {
							before(async function() {
								await burnPoolV2.checkStabilizerAndGetReward(
									0,
									10,
									parseEther('2'),
									parseEther('10000')
								);
							});
							it('The enum should be set to neutral before negative rebase', async function() {
								expect(await burnPoolV2.lastRebase()).eq(1);
							});
							it('On negative rebase it should start a new coupon cycle with the correct arguments', async function() {
								const cycleLen = await burnPoolV2.rewardCyclesLength();
								const epochs = await burnPoolV2.epochs();

								const rewardAmount = (await burnPoolV2.circBalance())
									.mul(await burnPoolV2.rewardsAccrued())
									.div(parseEther('1'));

								const rewardShare = rewardAmount.mul(parseEther('1')).div(await debase.totalSupply());

								await expect(
									burnPoolV2.checkStabilizerAndGetReward(-1, 10, parseEther('2'), parseEther('10000'))
								).to
									.emit(burnPoolV2, 'LogNewCouponCycle')
									.withArgs(cycleLen, epochs, rewardShare, 0, 0, 0, 0, 0, 0, 0, 0);
							});
							it('Reward cycles should be set to 2', async function() {
								expect(await burnPoolV2.rewardCyclesLength()).eq(2);
							});
						});
						describe('When next rebase goes from negative to a positive', () => {
							describe('When no coupons are bought', () => {
								it('On positive rebase no rewards distribution cycle should start', async function() {
									await expect(
										burnPoolV2.checkStabilizerAndGetReward(
											parseEther('30000'),
											10,
											parseEther('2'),
											parseEther('10000')
										)
									).to.not.emit(burnPoolV2, 'LogStartNewDistributionCycle');
								});
							});
							describe('When coupons are bought', () => {
								let debaseShareToBeRewarded: BigNumber;
								before(async function() {
									await burnPoolV2.checkStabilizerAndGetReward(
										-1,
										10,
										parseEther('2'),
										parseEther('10000')
									);
									await debaseUser.approve(burnPoolV2.address, parseEther('10'));
									await burnPoolUserV2.buyCoupons(parseEther('10'));
									await debaseUser.transfer(burnPoolV2.address, parseEther('160'));
								});
								it('On positive rebase rewards distribution cycle should start with the correct args', async function() {
									const offset = parseUnits('195', 16);
									const cycleLen = await burnPoolV2.rewardCyclesLength();
									const value = await burnPoolV2.getCurveValue(
										offset,
										mean,
										oneDivDeviationSqrtTwoPi,
										twoDeviationSquare
									);
									const rewardCycle = await burnPoolV2.rewardCycles(cycleLen.sub(1));

									const epochCycle = await burnPoolV2.epochs();
									const debasePerEpoch = rewardCycle[1].div(epochCycle);
									debaseShareToBeRewarded = await burnPoolV2.bytes16ToUnit256(value, debasePerEpoch);

									const rewardRate = debaseShareToBeRewarded.div(100);

									await expect(
										burnPoolV2.checkStabilizerAndGetReward(
											parseEther('50000'),
											10,
											parseEther('3'),
											parseEther('10000')
										)
									).to
										.emit(burnPoolV2, 'LogStartNewDistributionCycle')
										.withArgs(debaseShareToBeRewarded, rewardRate);
								});
								it('Epoch rewarded should be set to 1', async function() {
									const cycleLen = await burnPoolV2.rewardCyclesLength();
									const rewardCycle = await burnPoolV2.rewardCycles(cycleLen.sub(1));

									expect(await rewardCycle[2]).eq(1);
								});
								it('Rewards should be earnable', async function() {
									let cycle = await burnPoolV2.rewardCyclesLength();
									expect(await burnPoolUserV2.earned(cycle.sub(1))).to.not.eq(0);
								});
								it('Rewards should be claimable', async function() {
									let cycle = await burnPoolV2.rewardCyclesLength();

									await expect(burnPoolUserV2.getReward(cycle.sub(1))).to.emit(
										burnPoolV2,
										'LogRewardClaimed'
									);
								});
								describe('Multisig reward', () => {
									it('Multisig claim should be correct', async function() {
										const multiSigRewardToClaimShare = debaseShareToBeRewarded
											.mul(await burnPoolV2.multiSigRewardShare())
											.div(parseEther('1'));

										expect(await burnPoolV2.multiSigRewardToClaimShare()).eq(
											multiSigRewardToClaimShare
										);
									});

									it('Multisig should get the correct reward amount', async function() {
										const multiSigRewardToClaimAmount = (await debase.totalSupply())
											.mul(await burnPoolV2.multiSigRewardToClaimShare())
											.div(parseEther('1'));

										const multiSigBalanceIncrease = (await debase.balanceOf(multiSigAddress)).add(
											multiSigRewardToClaimAmount
										);

										await burnPoolUserMultiSig.multiSigRewardToClaimShare();
										expect(await debase.balanceOf(multiSigAddress)).eq(multiSigBalanceIncrease);
									});
								});
								describe('When next rebase is positive', () => {
									it('Should start new distribution cycle', async function() {
										await expect(
											burnPoolV2.checkStabilizerAndGetReward(
												parseEther('50000'),
												10,
												parseEther('3'),
												parseEther('10000')
											)
										).to.emit(burnPoolV2, 'LogStartNewDistributionCycle');
									});

									describe('When next rebase is positive again', () => {
										it('Should not start new distribution cycle since epoch target is hit', async function() {
											await expect(
												burnPoolV2.checkStabilizerAndGetReward(
													parseEther('50000'),
													10,
													parseEther('3'),
													parseEther('10000')
												)
											).to.not.emit(burnPoolV2, 'LogStartNewDistributionCycle');
										});
									});

									describe('When next rebase is neutral', () => {
										it('No distribution cycle should start', async function() {
											await expect(
												burnPoolV2.checkStabilizerAndGetReward(
													0,
													10,
													parseEther('3'),
													parseEther('10000')
												)
											).to.not.emit(burnPoolV2, 'LogStartNewDistributionCycle');
										});
										it('Rewards should still be earnable', async function() {
											let cycle = await burnPoolV2.rewardCyclesLength();
											expect(await burnPoolUserV2.earned(cycle.sub(1))).to.not.eq(0);
										});
									});

									describe('When next rebase is negative', () => {
										it('New reward cycle should start', async function() {
											await expect(
												burnPoolV2.checkStabilizerAndGetReward(
													-1,
													10,
													parseEther('3'),
													parseEther('10000')
												)
											).to.emit(burnPoolV2, 'LogNewCouponCycle');
										});
										it('Rewards from previous cycle should still be earnable', async function() {
											let cycle = await burnPoolV2.rewardCyclesLength();
											expect(await burnPoolUserV2.earned(cycle.sub(2))).to.not.eq(0);
										});
									});
								});
							});
						});
					});
				});
			});
		});
	});
});
