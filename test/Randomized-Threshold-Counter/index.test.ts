import { ethers } from 'hardhat';
import { BigNumber, Signer } from 'ethers';
import { expect } from 'chai';

import RandomizedCounterArtifact from '../../artifacts/contracts/Randomized-Threshold-Counter/RandomizedCounter.sol/RandomizedCounter.json';
import DebaseArtifact from '../../artifacts/contracts/Randomized-Threshold-Counter/Mock/Debase.sol/Debase.json';
import TokenArtifact from '../../artifacts/contracts/Randomized-Threshold-Counter/Mock/Token.sol/Token.json';
import MockRandomNumberConsumerArtifact from '../../artifacts/contracts/Randomized-Threshold-Counter/Mock/MockRandomNumberConsumer.sol/MockRandomNumberConsumer.json';

import { RandomizedCounterFactory } from '../../typechain/RandomizedCounterFactory';
import { TokenFactory } from '../../typechain/TokenFactory';
import { DebaseFactory } from '../../typechain/DebaseFactory';
import { MockRandomNumberConsumerFactory } from '../../typechain/MockRandomNumberConsumerFactory';

import { Token } from '../../typechain/Token';
import { RandomizedCounter } from '../../typechain/RandomizedCounter';
import { Debase } from '../../typechain/Debase';
import { MockRandomNumberConsumer } from '../../typechain/MockRandomNumberConsumer';

import { formatEther, parseEther, parseUnits } from 'ethers/lib/utils';

describe('Debase/Dai Randomized Counter', function() {
	let accounts: Signer[];
	let randomizedCounterFactory: RandomizedCounterFactory;
	let mockRandomNumberConsumerFactory: MockRandomNumberConsumerFactory;
	let tokenFactory: TokenFactory;
	let debaseFactory: DebaseFactory;

	before(async function() {
		accounts = await ethers.getSigners();

		randomizedCounterFactory = (new ethers.ContractFactory(
			RandomizedCounterArtifact.abi,
			RandomizedCounterArtifact.bytecode,
			accounts[0]
		) as any) as RandomizedCounterFactory;

		mockRandomNumberConsumerFactory = (new ethers.ContractFactory(
			MockRandomNumberConsumerArtifact.abi,
			MockRandomNumberConsumerArtifact.bytecode,
			accounts[0]
		) as any) as MockRandomNumberConsumerFactory;

		debaseFactory = (new ethers.ContractFactory(
			DebaseArtifact.abi,
			DebaseArtifact.bytecode,
			accounts[0]
		) as any) as DebaseFactory;

		tokenFactory = (new ethers.ContractFactory(
			TokenArtifact.abi,
			TokenArtifact.bytecode,
			accounts[0]
		) as any) as TokenFactory;
	});

	describe('Deploy and Initialize', function() {
		let randomizedCounter: RandomizedCounter;
		let randomNumberConsumer: MockRandomNumberConsumer;
		let debasedaiLP: Token;
		let link: Token;
		let debase: Debase;
		let address: string;
		let debasedaiLpUser2: Token;
		let randomizedCounter2: RandomizedCounter;
		let multiSigAddress: string;

		const duration = 2;
		const userLpLimit = parseEther('10');
		const userLpEnable = true;
		const poolLpLimit = parseEther('15');
		const poolLpEnable = true;
		const rewardPercentage = parseUnits('1', 17);
		const revokeRewardDuration = 1;
		const revokeReward = true;
		const normalDistributionMean = 5;
		const normalDistributionDeviation = 2;
		const multiSigRewardPercentage = parseUnits('1', 17);
		//prettier-ignore
		const normalDistribution = [8, 2, 1, 7, 10, 7, 5, 5, 3, 8, 5, 5, 3, 8, 4, 6, 5, 5, 3, 7, 6, 9, 8, 7, 6, 6, 5, 8, 6, 2, 8, 9, 5, 5, 4, 3, 8, 1, 5, 5, 5, 3, 5, 4, 8, 5, 6, 3, 4, 1, 3, 4, 3, 6, 4, 6, 5, 7, 6, 7, 5, 4, 1, 5, 6, 5, 7, 9, 3, 5, 4, 7, 3, 8, 7, 5, 5, 8, 0, 7, 4, 3, 6, 6, 4, 4, 5, 2, 4, 6, 6, 8, 8, 3, 7, 6, 7, 4, 4, 6]
		const vrf = '0xb3dCcb4Cf7a26f6cf6B120Cf5A73875B7BBc655B';
		const keyHash = '0x2ed0feb3e7fd2022120aa84fab1945545a9f2ffc9076fd6156fa96eaff4c1311';
		const fee = parseUnits('1', 17);

		before(async function() {
			address = await accounts[0].getAddress();
			let address2 = await accounts[1].getAddress();
			let address3 = await accounts[2].getAddress();

			multiSigAddress = address3;
			debase = await debaseFactory.deploy();
			debasedaiLP = await tokenFactory.deploy('DEBASEDAILP', 'DEBASEDAILP');
			link = await tokenFactory.deploy('LINK', 'LINK');
			debasedaiLpUser2 = await debasedaiLP.connect(accounts[1]);
			randomizedCounter = await randomizedCounterFactory.deploy();
			await debasedaiLP.transfer(address2, parseEther('200'));

			randomNumberConsumer = await mockRandomNumberConsumerFactory.deploy(
				address,
				randomizedCounter.address,
				link.address,
				fee
			);

			await randomizedCounter.initialize(
				debase.address,
				debasedaiLP.address,
				address,
				randomNumberConsumer.address,
				link.address,
				rewardPercentage,
				duration,
				userLpEnable,
				userLpLimit,
				poolLpEnable,
				poolLpLimit,
				revokeRewardDuration,
				normalDistributionMean,
				normalDistributionDeviation,
				normalDistribution
			);

			await randomizedCounter.setMultiSigAddress(multiSigAddress);
			await randomizedCounter.setMultiSigRewardPercentage(multiSigRewardPercentage);
			randomizedCounter2 = await randomizedCounter.connect(accounts[1]);
			await randomizedCounter.setRevokeReward(revokeReward);
		});

		describe('Initial settings check', function() {
			it('Reward token should be debase', async function() {
				expect(await randomizedCounter.debase()).eq(debase.address);
			});
			it('Pair token should be debasedai lp', async function() {
				expect(await randomizedCounter.y()).eq(debasedaiLP.address);
			});
			it('Policy should be policy contract', async function() {
				expect(await randomizedCounter.policy()).eq(address);
			});
			it('Duration should be correct', async function() {
				expect(await randomizedCounter.blockDuration()).eq(duration);
			});
			it('Reward Percentage should be correct', async function() {
				expect(await randomizedCounter.rewardPercentage()).eq(rewardPercentage);
			});
			it('Revoke Reward Percentage should be enabled', async function() {
				expect(await randomizedCounter.revokeReward()).eq(revokeReward);
			});
			it('Revoke Reward Duration should be correct', async function() {
				expect(await randomizedCounter.revokeRewardDuration()).eq(revokeRewardDuration);
			});
			it('Pool should be  disabled', async function() {
				expect(await randomizedCounter.poolEnabled()).false;
			});
			it('User lp limit should be enabled', async function() {
				expect(await randomizedCounter.enableUserLpLimit()).eq(userLpEnable);
			});
			it('User lp limit should be correct', async function() {
				expect(await randomizedCounter.userLpLimit()).eq(userLpLimit);
			});
			it('Pool lp limit should be enabled', async function() {
				expect(await randomizedCounter.enablePoolLpLimit()).eq(poolLpEnable);
			});
			it('Pool lp limit should be correct', async function() {
				expect(await randomizedCounter.poolLpLimit()).eq(poolLpLimit);
			});
			it('Mean should be correct', async function() {
				expect(await randomizedCounter.normalDistributionMean()).eq(normalDistributionMean);
			});
			it('Distribution should be correct', async function() {
				expect(await randomizedCounter.normalDistributionDeviation()).eq(normalDistributionDeviation);
			});
			it('Multi Sig Address should be correct', async function() {
				expect(await randomizedCounter.multiSigAddress()).eq(multiSigAddress);
			});
			it('Multi Sig Reward Percentage should be correct', async function() {
				expect(await randomizedCounter.multiSigRewardPercentage()).eq(multiSigRewardPercentage);
			});
		});

		describe('When Pool is disabled', () => {
			it('Should not be able to stake', async function() {
				await expect(randomizedCounter.stake(parseEther('10'))).to.be.reverted;
			});
			it('Should not be able to withdraw', async function() {
				await expect(randomizedCounter.withdraw(parseEther('10'))).to.be.reverted;
			});
		});

		describe('When Pool is enabled', () => {
			before(async function() {
				await randomizedCounter.setPoolEnabled(true);
			});

			describe('When pool is not rewarded balance', () => {
				before(async function() {
					await debasedaiLP.approve(randomizedCounter.address, parseEther('10'));
				});
				it('Should be enabled', async function() {
					expect(await randomizedCounter.poolEnabled()).to.be.true;
				});
				it('Should be able to stake', async function() {
					expect(await randomizedCounter.stake(parseEther('10')));
				});
				it('Should have correct stake balance', async function() {
					expect(await randomizedCounter.balanceOf(address)).to.eq(parseEther('10'));
				});
				it('Should be able to withdraw', async function() {
					expect(await randomizedCounter.withdraw(parseEther('10')));
				});
				it('Should not earn rewards', async function() {
					expect(await randomizedCounter.earned(address)).eq(0);
				});
			});

			describe('User/Pool Lp Limits', () => {
				before(async function() {
					await debasedaiLP.approve(randomizedCounter.address, parseEther('20'));
					await debasedaiLpUser2.approve(randomizedCounter.address, parseEther('20'));
				});
				it('User cant stake more than user lp limit once', async function() {
					await expect(randomizedCounter.stake(parseEther('11'))).to.be.revertedWith(
						'Cant stake more than lp limit'
					);
				});
				it('User cant stake more than user lp limit when combined with previous user stakes', async function() {
					await randomizedCounter.stake(parseEther('6'));
					await expect(randomizedCounter.stake(parseEther('5'))).to.be.revertedWith(
						'Cant stake more than lp limit'
					);
				});
				it('Users cant stake more pool lp limit', async function() {
					await expect(randomizedCounter2.stake(parseEther('10'))).to.be.revertedWith(
						'Cant stake pool lp limit reached'
					);
				});
			});

			describe('When Supply Delta is negative or zero', () => {
				before(async function() {
					await randomizedCounter.exit();
				});
				it('Check stabilizer function call should not fail', async function() {
					await expect(randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, parseEther('100'))).to.not.be
						.reverted;
				});
				it('Count should not increase and be zero', async function() {
					expect(await randomizedCounter.count()).to.eq(0);
				});
			});

			describe('When Supply Delta is positive', () => {
				describe('When consumer contract is not funded', () => {
					it('Check stabilizer function call should not fail', async function() {
						await expect(randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('100'))).to.not
							.be.reverted;
					});
					it('Count should increase', async function() {
						expect(await randomizedCounter.count()).to.eq(1);
					});
					it('Count should return to zero on next check stabilizer call where delta is not positive', async function() {
						await randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, parseEther('100'));
						expect(await randomizedCounter.count()).to.eq(0);
					});
					describe('Sequence check count disabled', () => {
						before(async function() {
							await randomizedCounter.setCountInSequence(false);
						});
						it('Count should increase to 1 on a positive check stabilizer call', async function() {
							await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('100'));
							expect(await randomizedCounter.count()).to.eq(1);
						});
						it('Count should remain at 1 on a negative check stabilizer call', async function() {
							await randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, parseEther('100'));
							expect(await randomizedCounter.count()).to.eq(1);
						});
					});
				});
				describe('When consumer contract is funded', () => {
					let bal: BigNumber;
					before(async function() {
						await randomizedCounter.setCountInSequence(true);
						await randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, parseEther('100'));
						await link.transfer(randomNumberConsumer.address, parseEther('10'));
						await randomizedCounter.setBlockDuration(5);
						bal = await link.balanceOf(randomNumberConsumer.address);
					});
					it('Check stabilizer function call should emit reward claim with correct reward amount', async function() {
						let rewardToClaim = parseEther('100').mul(rewardPercentage).div(parseEther('1'));
						let multiSigClaim = rewardToClaim
							.mul(await randomizedCounter.multiSigRewardPercentage())
							.div(parseEther('1'));

						await expect(randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('100'))).to
							.emit(randomizedCounter, 'LogRewardsClaimed')
							.withArgs(rewardToClaim.add(multiSigClaim));
					});
					it('Count should increase', async function() {
						expect(await randomizedCounter.count()).to.eq(1);
					});
					it('Random Consumer link balance less should be less than previous balance ', async function() {
						expect(await link.balanceOf(randomNumberConsumer.address)).to.not.eq(bal);
					});
					describe('When random threshold for claim function does not hit target count by getting a higher threshold', () => {
						before(async function() {
							await debase.transfer(
								randomizedCounter.address,
								parseEther('100').mul(rewardPercentage).div(parseEther('1'))
							);
						});
						it('Emit a claim revoked event with correct revoke amount', async function() {
							const lastClaim = parseEther('100').mul(rewardPercentage).div(parseEther('1'));
							const lastClaimPercentage = lastClaim.mul(parseEther('1')).div(await debase.totalSupply());

							const revokeAmount = (await debase.totalSupply())
								.mul(lastClaimPercentage)
								.div(parseEther('1'));
							await expect(randomNumberConsumer.fulfillRandomness(2100)).to
								.emit(randomizedCounter, 'LogClaimRevoked')
								.withArgs(revokeAmount);
						});
						it('Contract reward balance should be zero', async function() {
							expect(await debase.balanceOf(randomizedCounter.address)).to.eq(0);
						});
					});
					describe('When claim function is never called by the random number consumer', () => {
						before(async function() {
							expect(await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('100')));
							await debase.transfer(
								randomizedCounter.address,
								parseEther('100').mul(rewardPercentage).div(parseEther('1'))
							);
						});
						it('Emit a claim revoked event on next check stabilizer call', async function() {
							await expect(randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('100'))).to
								.emit(randomizedCounter, 'LogRewardsClaimed')
								.withArgs(parseEther('100').mul(rewardPercentage).div(parseEther('1')));
						});
					});
					describe('When random threshold for claim function does hit target count by getting a threshold', () => {
						let multiSigBalanceBefore: BigNumber;
						before(async function() {
							multiSigBalanceBefore = await debase.balanceOf(multiSigAddress);
							expect(await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('100')));
							await debase.transfer(
								randomizedCounter.address,
								parseEther('100').mul(rewardPercentage).div(parseEther('1'))
							);
						});
						it('Should emit a new distribution cycle', async function() {
							const lastClaim = parseEther('100').mul(rewardPercentage).div(parseEther('1'));
							const lastClaimPercentage = lastClaim.mul(parseEther('1')).div(await debase.totalSupply());
							const rewardRate = lastClaimPercentage.div(5);

							await expect(randomNumberConsumer.fulfillRandomness(2001)).to
								.emit(randomizedCounter, 'LogStartNewDistributionCycle')
								.withArgs(
									lastClaimPercentage,
									rewardRate,
									(await randomizedCounter.lastUpdateBlock()).add(5),
									4
								);
						});
						it('MultiSig Reward Amount should increase by correct amount', async function() {
							let multiSigIncreaseBy = (await debase.totalSupply())
								.mul(await randomizedCounter.multiSigRewardToClaimShare())
								.div(parseEther('1'));
							expect(await debase.balanceOf(multiSigAddress)).to.eq(
								multiSigBalanceBefore.add(multiSigIncreaseBy)
							);
						});
						it('Should not emit rewards claimed as period not finished', async function() {
							await expect(
								randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('100'))
							).not.emit(randomizedCounter, 'LogRewardsClaimed');
						});
						describe('When stacking rewards are true', () => {
							before(async function() {
								await randomizedCounter.setBeforePeriodFinish(true);
								await randomizedCounter.setBlockDuration(9);
							});
							it('Should emit rewards claimed even though last period not finished', async function() {
								await expect(
									randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('100'))
								).emit(randomizedCounter, 'LogRewardsClaimed');
							});
							it('Should be able to stake', async function() {
								await debase.transfer(
									randomizedCounter.address,
									parseEther('100').mul(rewardPercentage).div(parseEther('1'))
								);
								await randomNumberConsumer.fulfillRandomness(2002);

								expect(await randomizedCounter.stake(parseEther('10')));
							});
							it('Should be able to withdraw', async function() {
								expect(await randomizedCounter.withdraw(parseEther('10')));
							});
							it('Should earn rewards', async function() {
								expect(await randomizedCounter.earned(address)).not.eq(0);
							});
							it('Should emit a transfer event when rewards are claimed', async function() {
								await expect(randomizedCounter.getReward()).to.emit(debase, 'Transfer');
							});
							describe('Revoke Rewards', () => {
								before(async function() {
									await randomizedCounter.setCountInSequence(true);
									await randomizedCounter.setRevokeReward(true);
								});
								it('Should emit rewards revoked event', async function() {
									await expect(
										randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, parseEther('100'))
									)
										.emit(randomizedCounter, 'LogRewardRevoked')
										.withArgs(
											1,
											(await randomizedCounter.rewardRate()).mul(1),
											(await debase.totalSupply())
												.mul(await randomizedCounter.rewardRate())
												.div(parseEther('1'))
										);
								});
								describe('When revoke reward duration is bigger than block duration', () => {
									before(async function() {
										await randomizedCounter.setRevokeRewardDuration(5);
									});
									it('Should not emit rewards revoked event', async function() {
										await expect(
											randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, parseEther('100'))
										).not.emit(randomizedCounter, 'LogRewardRevoked');
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
