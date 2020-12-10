import { ethers } from 'hardhat';
import { ContractTransaction, Signer } from 'ethers';
import { expect } from 'chai';

import RandomizedCounterArtifact from '../../artifacts/contracts/Randomized-Threshold-Counter/RandomizedCounter.sol/RandomizedCounter.json';
import TokenArtifact from '../../artifacts/contracts/Mock/Token.sol/Token.json';

import { RandomizedCounterFactory } from '../../typechain/RandomizedCounterFactory';
import { TokenFactory } from '../../typechain/TokenFactory';
import { Token } from '../../typechain/Token';
import { RandomizedCounter } from '../../typechain/RandomizedCounter';

import { parseEther } from 'ethers/lib/utils';

describe('Randomized Threshold Counter', function() {
	let accounts: Signer[];
	let randomizedCounterFactory: RandomizedCounterFactory;
	let tokenFactory: TokenFactory;

	before(async function() {
		accounts = await ethers.getSigners();

		randomizedCounterFactory = (new ethers.ContractFactory(
			RandomizedCounterArtifact.abi,
			RandomizedCounterArtifact.bytecode,
			accounts[0]
		) as any) as RandomizedCounterFactory;

		tokenFactory = (new ethers.ContractFactory(
			TokenArtifact.abi,
			TokenArtifact.bytecode,
			accounts[0]
		) as any) as TokenFactory;
	});

	describe('Deploy and Initialize', function() {
		let randomizedCounter: RandomizedCounter;
		let debase: Token;
		const dai = '0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735';
		const policy = '0x989Edd2e87B1706AB25b2E8d9D9480DE3Cc383eD';
		const rewardAmount = parseEther('100');
		const duration = 4 * 24 * 60 * 60;

		before(async function() {
			debase = await tokenFactory.deploy('DEBASE', 'DEBASE');
			randomizedCounter = await randomizedCounterFactory.deploy();

			const tx = await randomizedCounter.initialize(
				'Random Counter',
				debase.address,
				dai,
				policy,
				rewardAmount,
				duration
			);

			tx.wait(1);
		});

		describe('Initial settings', function() {
			it('Counter reward token should be debase', async function() {
				expect(await randomizedCounter.rewardToken()).eq(debase.address);
			});

			it('Counter pair token should be dai', async function() {
				expect(await randomizedCounter.y()).eq(dai);
			});

			it('Counter policy should be policy contract', async function() {
				expect(await randomizedCounter.policy()).eq(policy);
			});

			it('Counter reward amount should be correct', async function() {
				expect(await randomizedCounter.rewardAmount()).eq(rewardAmount);
			});

			it('Counter duration should be correct', async function() {
				expect(await randomizedCounter.duration()).eq(duration);
			});

			it('Counter pool should be disabled', async function() {
				expect(await randomizedCounter.poolEnabled()).false;
			});

			it('Counter count in sequence should be true', async function() {
				expect(await randomizedCounter.countInSequence()).true;
			});

			it('Counter initial count should be zero', async function() {
				expect(await randomizedCounter.count()).eq(0);
			});

			it('Counter revoke reward should be disabled', async function() {
				expect(await randomizedCounter.revokeReward()).false;
			});

			it('Counter reward before period finished be disabled', async function() {
				expect(await randomizedCounter.beforePeriodFinish()).false;
			});
		});
	});

	describe('Check Stabilizer And Get Reward Function', function() {
		let randomizedCounter: RandomizedCounter;
		let debase: Token;
		let result: ContractTransaction;
		let countBefore: any;
		let totalRewardsBefore: any;
		let periodFinishBefore: any;
		let account: string;

		const dai = '0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735';
		const policy = '0x989Edd2e87B1706AB25b2E8d9D9480DE3Cc383eD';
		const rewardAmount = parseEther('10');
		const duration = 4 * 24 * 60 * 60;

		describe('When supply delta is less than or equal to zero', function() {
			before(async function() {
				randomizedCounter = await randomizedCounterFactory.deploy();
				debase = await tokenFactory.deploy('DEBASE', 'DEBASE');
				account = await accounts[0].getAddress();
				let result = await randomizedCounter.initialize(
					'Random Counter',
					debase.address,
					dai,
					account,
					rewardAmount,
					duration
				);
				await result.wait(1);
				countBefore = await randomizedCounter.count();
				totalRewardsBefore = await randomizedCounter.totalRewards();
				let tx = await randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, parseEther('1'));
				await tx.wait(1);
			});
			it('Pool period finish should not change', async function() {
				expect(await randomizedCounter.periodFinish()).eq(0);
			});
			it('Count should not increase', async function() {
				expect(await randomizedCounter.count()).eq(countBefore);
			});
			it('Total rewards should not decrease', async function() {
				expect(await randomizedCounter.totalRewards()).eq(totalRewardsBefore);
			});
		});

		describe('When supply delta is greater than zero', function() {
			describe('For single transaction', function() {
				before(async function() {
					randomizedCounter = await randomizedCounterFactory.deploy();
					account = await accounts[0].getAddress();
					let result = await randomizedCounter.initialize(
						'Random Counter',
						debase.address,
						dai,
						account,
						rewardAmount,
						duration
					);
					await result.wait(1);
					countBefore = await randomizedCounter.count();
					totalRewardsBefore = await randomizedCounter.totalRewards();
					let tx = await randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, parseEther('1'));
					await tx.wait(1);
				});
				it('Pool period finish should not change', async function() {
					expect(await randomizedCounter.periodFinish()).eq(0);
				});
				it('Count should not increase', async function() {
					expect(await randomizedCounter.count()).eq(countBefore);
				});
				it('Total rewards should not decrease', async function() {
					expect(await randomizedCounter.totalRewards()).eq(totalRewardsBefore);
				});
			});

			describe('Sequence counter check', () => {
				describe('Sequence flag enabled', () => {
					before(async function() {
						randomizedCounter = await randomizedCounterFactory.deploy();
						account = await accounts[0].getAddress();
						let result = await randomizedCounter.initialize(
							'Random Counter',
							debase.address,
							dai,
							account,
							rewardAmount,
							duration
						);
						await result.wait(1);
						countBefore = await randomizedCounter.count();
						totalRewardsBefore = await randomizedCounter.totalRewards();
						let tx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1'));
						await tx.wait(1);
					});
					it('Count in sequence flag should be true', async function() {
						expect(await randomizedCounter.countInSequence()).true;
					});
					it('Count should be 1 when supply delta is greater than zero', async function() {
						expect(await randomizedCounter.count()).eq(1);
					});
					it('Count should reset to 0 when supply delta <= zero', async function() {
						let tx = await randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, parseEther('1'));
						await tx.wait(1);
						expect(await randomizedCounter.count()).eq(0);
					});
				});
				describe('Sequence flag disabled', () => {
					before(async function() {
						randomizedCounter = await randomizedCounterFactory.deploy();
						account = await accounts[0].getAddress();
						let result = await randomizedCounter.initialize(
							'Random Counter',
							debase.address,
							dai,
							account,
							rewardAmount,
							duration
						);
						await result.wait(1);
						countBefore = await randomizedCounter.count();
						totalRewardsBefore = await randomizedCounter.totalRewards();
						let tx = await randomizedCounter.setCountInSequence(false);
						await tx.wait(1);
						tx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1'));
						await tx.wait(1);
					});
					it('Count in sequence flag should be true', async function() {
						expect(await randomizedCounter.countInSequence()).false;
					});
					it('Count should be 1 when supply delta is greater than zero', async function() {
						expect(await randomizedCounter.count()).eq(1);
					});
					it('Count should be 1 when supply delta <= zero', async function() {
						let tx = await randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, parseEther('1'));
						await tx.wait(1);
						expect(await randomizedCounter.count()).eq(1);
					});
				});
			});

			describe('For normal mean of 8 and div 0', function() {
				describe('For 8 function calls and stabilizer balance less request amount', () => {
					before(async function() {
						randomizedCounter = await randomizedCounterFactory.deploy();

						account = await accounts[0].getAddress();
						let result = await randomizedCounter.initialize(
							'Random Counter',
							debase.address,
							dai,
							account,
							rewardAmount,
							duration
						);
						await result.wait(1);
						countBefore = await randomizedCounter.count();
						totalRewardsBefore = await randomizedCounter.totalRewards();

						//prettier-ignore
						await randomizedCounter.setNormalDistribution(8,0,[8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8])
						let transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1'));
						transferTx.wait(1);
					});
					it('Count before 8th call should be 7', async function() {
						expect(await randomizedCounter.count()).eq(7);
					});
					describe('Call function 8th time', () => {
						before(async function() {
							let tx = await randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, parseEther('1'));
							await tx.wait(1);
						});
						it('Pool period finish eq to zero', async function() {
							expect(await randomizedCounter.periodFinish()).eq(0);
						});
						it('Total rewards should not decrease', async function() {
							expect(await randomizedCounter.totalRewards()).eq(totalRewardsBefore);
						});
						it('Count after 8th call should be 0', async function() {
							expect(await randomizedCounter.count()).eq(0);
						});
						it('Total reward amount should not increase', async function() {
							expect(await randomizedCounter.totalRewards()).eq(0);
						});
					});
				});

				describe('For 8 function calls and stabilizer balance is more request amount', () => {
					before(async function() {
						randomizedCounter = await randomizedCounterFactory.deploy();

						account = await accounts[0].getAddress();
						let result = await randomizedCounter.initialize(
							'Random Counter',
							debase.address,
							dai,
							account,
							rewardAmount,
							duration
						);
						await result.wait(1);
						countBefore = await randomizedCounter.count();
						totalRewardsBefore = await randomizedCounter.totalRewards();

						//prettier-ignore
						await randomizedCounter.setNormalDistribution(8,0,[8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8])
						//prettier-ignore
						let transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
						transferTx.wait(1);
						transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
						transferTx.wait(1);
					});

					it('Count before 8th call should be 7', async function() {
						expect(await randomizedCounter.count()).eq(7);
					});
					describe('Call function 8th time', () => {
						before(async function() {
							let tx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
							await tx.wait(1);
						});
						it('Pool period finish not eq to zero', async function() {
							expect(await randomizedCounter.periodFinish()).not.eq(0);
						});
						it('Total rewards should not decrease', async function() {
							expect(await randomizedCounter.totalRewards()).not.eq(totalRewardsBefore);
						});
						it('Count after 8th call should be 0', async function() {
							expect(await randomizedCounter.count()).eq(0);
						});
					});
				});
			});

			describe('Revoke reward check', () => {
				describe('Revoke reward enabled', () => {
					describe('When no rewards available to be revoked', () => {
						before(async function() {
							randomizedCounter = await randomizedCounterFactory.deploy();

							account = await accounts[0].getAddress();
							let result = await randomizedCounter.initialize(
								'Random Counter',
								debase.address,
								dai,
								account,
								rewardAmount,
								duration
							);
							await result.wait(1);
							countBefore = await randomizedCounter.count();
							totalRewardsBefore = await randomizedCounter.totalRewards();

							//prettier-ignore
							await randomizedCounter.setNormalDistribution(8,0,[8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8])
							//prettier-ignore
							let transferTx = await randomizedCounter.setRevokeReward(true)
							transferTx.wait(1);
							//prettier-ignore
							transferTx = await randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, parseEther('1000'));
							transferTx.wait(1);
						});
						it('Pool period should not change', async function() {
							let periodFinishBefore = await randomizedCounter.periodFinish();
							expect(await randomizedCounter.periodFinish()).eq(periodFinishBefore);
						});
						it('Total rewards should not decrease', async function() {
							expect(await randomizedCounter.totalRewards()).eq(totalRewardsBefore);
						});
					});
					describe('When rewards available to be revoked', () => {
						describe('When revoke reward duration is <= period finish', () => {
							before(async function() {
								randomizedCounter = await randomizedCounterFactory.deploy();

								account = await accounts[0].getAddress();
								let result = await randomizedCounter.initialize(
									'Random Counter',
									debase.address,
									dai,
									account,
									rewardAmount,
									duration
								);
								await result.wait(1);
								countBefore = await randomizedCounter.count();

								//prettier-ignore
								await randomizedCounter.setNormalDistribution(8,0,[8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8])

								await randomizedCounter.setRevokeReward(true);
								await randomizedCounter.setRevokeRewardDuration(24 * 60 * 60);
								//prettier-ignore
								let transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
								transferTx.wait(1);
								//prettier-ignore
								transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
								transferTx.wait(1);
								//prettier-ignore
								transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
								transferTx.wait(1);
								//prettier-ignore
								transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
								transferTx.wait(1);
								//prettier-ignore
								transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
								transferTx.wait(1);
								//prettier-ignore
								transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
								transferTx.wait(1);
								//prettier-ignore
								transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
								transferTx.wait(1);
								//prettier-ignore
								transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
								transferTx.wait(1);
								totalRewardsBefore = await randomizedCounter.totalRewards();
								periodFinishBefore = await randomizedCounter.periodFinish();

								transferTx = await debase.transfer(
									randomizedCounter.address,
									await randomizedCounter.rewardAmount()
								);
								transferTx.wait(1);

								//prettier-ignore
								transferTx = await randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, parseEther('1000'));
								transferTx.wait(1);
							});

							it('Pool period should decrease by revoke reward duration', async function() {
								let calPeriodFinish = periodFinishBefore.sub(
									await randomizedCounter.revokeRewardDuration()
								);
								expect(await randomizedCounter.periodFinish()).eq(calPeriodFinish);
							});
							it('Total rewards should decrease by revoke reward amount', async function() {
								let revokeReward = (await randomizedCounter.revokeRewardDuration()).mul(
									await randomizedCounter.rewardRate()
								);
								let newTotalRewards = totalRewardsBefore.sub(revokeReward);
								expect(await randomizedCounter.totalRewards()).eq(newTotalRewards);
							});
						});

						describe('When revoke reward duration is > period finish', () => {
							before(async function() {
								randomizedCounter = await randomizedCounterFactory.deploy();

								account = await accounts[0].getAddress();
								let result = await randomizedCounter.initialize(
									'Random Counter',
									debase.address,
									dai,
									account,
									rewardAmount,
									duration
								);
								await result.wait(1);
								countBefore = await randomizedCounter.count();
								totalRewardsBefore = await randomizedCounter.totalRewards();

								//prettier-ignore
								await randomizedCounter.setNormalDistribution(8,0,[8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8])

								await randomizedCounter.setRevokeReward(true);
								await randomizedCounter.setRevokeRewardDuration(5 * 24 * 60 * 60);
								//prettier-ignore
								let transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
								transferTx.wait(1);
								//prettier-ignore
								transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
								transferTx.wait(1);
								//prettier-ignore
								transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
								transferTx.wait(1);
								//prettier-ignore
								transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
								transferTx.wait(1);
								//prettier-ignore
								transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
								transferTx.wait(1);
								//prettier-ignore
								transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
								transferTx.wait(1);
								//prettier-ignore
								transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
								transferTx.wait(1);

								transferTx = await debase.transfer(
									randomizedCounter.address,
									await randomizedCounter.rewardAmount()
								);
								transferTx.wait(1);
								//prettier-ignore
								transferTx = await randomizedCounter.checkStabilizerAndGetReward(1, 1, 1, parseEther('1000'));
								transferTx.wait(1);
								totalRewardsBefore = await randomizedCounter.totalRewards();
								periodFinishBefore = await randomizedCounter.periodFinish();

								//prettier-ignore
								transferTx = await randomizedCounter.checkStabilizerAndGetReward(0, 1, 1, parseEther('1000'));
								transferTx.wait(1);
							});
							it('Pool period should decrease by revoke reward duration', async function() {
								expect(await randomizedCounter.periodFinish()).eq(periodFinishBefore);
							});
							it('Total rewards should decrease by reward amount', async function() {
								expect(await randomizedCounter.totalRewards()).eq(totalRewardsBefore);
							});
						});
					});
				});
			});
		});
	});
});
