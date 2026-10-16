/** Original migration bytes pinned at the approved installed-owner boundary. */
export const ORIGINAL_RUNTIME_PREREQUISITES = {
 "foundation": [
  {
   "version": 1,
   "file": "infra/migrations/0001_core_records.sql",
   "digest": "3976b9d7d6c877b17c91296cf19cf728cf1a378f284b58b554e546950e4bb027"
  },
  {
   "version": 2,
   "file": "g1-foundations/migrations/0002_controller_roles.sql",
   "digest": "2f40417a2b7f3544a64e7c57dcc7e84006a29e3f49458363f6ba553bd8361569"
  }
 ],
 "identity": [
  {
   "version": 3,
   "file": "g1-identity/migrations/0003_identity_approvals.sql",
   "digest": "d7170eb1b5a4733421c6b4e1f05e92e7eba0663b341f7d48697e0e65fab759b7"
  }
 ],
 "recovery": [
  {
   "version": 4,
   "file": "g1-recovery/migrations/0004_recovery.sql",
   "digest": "f8ef0b1e8dffba943843f72d6bc070a7ccf229c68e2363d214b8f4391e33cf13"
  },
  {
   "version": 5,
   "file": "g1-recovery/migrations/0005_native_history.sql",
   "digest": "50a702ec1d750bf69926dab22c203b80e7fe669dc43791d8e88277a183e3c1e7"
  },
  {
   "version": 6,
   "file": "g1-recovery/migrations/0006_effect_reconciliation.sql",
   "digest": "a6528f72191a19576b88f4d40e9ef3c5d7ce7f8a55d23565c4015f3b0a2fc659"
  },
  {
   "version": 7,
   "file": "g1-recovery/migrations/0007_fences.sql",
   "digest": "f5c1135cad168f7c961bce725e5c2621bf814823ef4ba78aa9fbd26b7209d1a7"
  },
  {
   "version": 8,
   "file": "g1-recovery/migrations/0008_dispatch.sql",
   "digest": "2ec0c03a5a42b31678e29d0523fe98235bf3682a8f953aff97685e33072d0460"
  },
  {
   "version": 9,
   "file": "g1-recovery/migrations/0009_results.sql",
   "digest": "d48656785b4ab27c0220648d479b325155339815423c5ed3222938515cfa9f88"
  },
  {
   "version": 10,
   "file": "g1-recovery/migrations/0010_resource_reconciliation.sql",
   "digest": "f0c6f09e637f2d120e036e958320fb8443329b0c580ac8e3b445210029388db0"
  }
 ],
 "model": [
  {
   "version": 1,
   "file": "g1-model/migrations/0001_receipt_domain.sql",
   "digest": "2fe5f3dc4fa13cb0dc70af4a3ad0dedf683cd0e4615527a62c316ec41184d9a0"
  },
  {
   "version": 2,
   "file": "g1-model/migrations/0002_model_ledger.sql",
   "digest": "ec7f9e1896032f2b0eca9134573696046cbcbafb2eafeb764a3a5a0d92c727a5"
  },
  {
   "version": 3,
   "file": "g1-model/migrations/0003_model_usage.sql",
   "digest": "f4ecb1bbba7069ab5fd18e4a0e49250ac8b284f8ac2ee13c29d83b54a13f1d0c"
  },
  {
   "version": 4,
   "file": "g1-model/migrations/0004_model_usage_views.sql",
   "digest": "4140e34fa2e5e59305e696299deebfde284f28e1c9952b7dcaca47524f27dd1a"
  },
  {
   "version": 5,
   "file": "g1-model/migrations/0005_model_usage_keys.sql",
   "digest": "890a6200018fe1122fbae898f7a9c0b9a16195ed09f4f6a71a4d6f592f342aa2"
  },
  {
   "version": 6,
   "file": "g1-model/migrations/0006_native_controls.sql",
   "digest": "87b91acda8e93060814209c2d8a84703e876b2dfc16636a6ace151b730941157"
  },
  {
   "version": 7,
   "file": "g1-model/migrations/0007_native_views.sql",
   "digest": "2b767ed53d6d4d2490b54ae4e416469b28a95b00f5f131901a19ec682be98ef8"
  },
  {
   "version": 8,
   "file": "g1-model/migrations/0008_native_computer.sql",
   "digest": "5f0f3f50bbf6f96a4411da2e38bba470daf0c153374befade0c6a2965ef34fad"
  },
  {
   "version": 9,
   "file": "g1-model/migrations/0009_resource_intervals.sql",
   "digest": "f3c61de186dde524109b014a01f7944ac36202de0b813ab673aa1d0a8b2f5c5f"
  },
  {
   "version": 10,
   "file": "g1-model/migrations/0010_resource_views.sql",
   "digest": "89a6bf71d641461761eda888deb1f8f1e6c942755c3665b682e922cf18eb94fe"
  },
  {
   "version": 11,
   "file": "g1-model/migrations/0011_operator_views.sql",
   "digest": "2488f471736fc102b47d26e619172288d22971afb2dc168a3721e51fc0bb5487"
  },
  {
   "version": 12,
   "file": "g1-model/migrations/0012_family_budget.sql",
   "digest": "c156b08d707d2175036606aad19144c3b43e7679031b1524a9a6b482497296a7"
  },
  {
   "version": 13,
   "file": "g1-model/migrations/0013_unclaimed_seal.sql",
   "digest": "1bbbf35567c9bb1663f061984070428da0e61f0abba3404909d9d9e753b1e5e6"
  },
  {
   "version": 14,
   "file": "g1-model/migrations/0014_preparation_refusals.sql",
   "digest": "71e92017cffc8c5e7021493fffe3243881080dffc6d3e1f90f2ba3d9f84aad46"
  }
 ],
 "storage": [
  {
   "version": 1,
   "file": "g1-storage/migrations/0001_resource_identity.sql",
   "digest": "e26197ddce314fc9d1523f3374e6a24b409810d5e7f3a84fcab0d90dcc6e71ee"
  },
  {
   "version": 2,
   "file": "g1-storage/migrations/0002_current_authority.sql",
   "digest": "1cfda632d88afeb4bb679aaaf807e8d30f6f3afeafc0f72a6afb51135ecec456"
  },
  {
   "version": 3,
   "file": "g1-storage/migrations/0003_shared_authority.sql",
   "digest": "2679071575b61a2203097456d76d7441b220d3f6e135ae0dfeab8d47e67d8e5a"
  },
  {
   "version": 4,
   "file": "g1-storage/migrations/0004_epoch_publication.sql",
   "digest": "5655dcfbfdb2412713df2562c8e8ad32537ce0036540ef74c5542b9b790568fe"
  },
  {
   "version": 5,
   "file": "g1-storage/migrations/0005_policy_publication.sql",
   "digest": "cdacba2dd4ebd6043c9f1d1a262263269445bb7ad73fa69086464c8dc5e4d62b"
  },
  {
   "version": 6,
   "file": "g1-storage/migrations/0006_source_revocation.sql",
   "digest": "8602b3748fc7ad4d7f62e8cbacc00c63f2506c28e113e199baba917c60745d01"
  },
  {
   "version": 7,
   "file": "g1-storage/migrations/0007_tombstone_publication.sql",
   "digest": "51ed3fa8316877aa425a1a44c9c4fc4e5ebffded0fe170aa6308c47a0539e274"
  },
  {
   "version": 8,
   "file": "g1-storage/migrations/0008_forget_work.sql",
   "digest": "eb0161fd3a2d1bd981cb1507ebba3b8e280918fc19529e9e8887e9432aa30c88"
  },
  {
   "version": 9,
   "file": "g1-storage/migrations/0009_head_publication.sql",
   "digest": "23e52909335b8349bab825d7f247eee3a1b14d3320646441746694aa474c90f1"
  },
  {
   "version": 10,
   "file": "g1-storage/migrations/0010_share_publication.sql",
   "digest": "066f7f9c413f83961c58e7fc4590d429c4a48e56204eaff77f8b5a76cb3f777c"
  },
  {
   "version": 11,
   "file": "g1-storage/migrations/0011_staging_preparation.sql",
   "digest": "43ce154a9001c3be12fcadd8cf3e881282923221365784d7cded08d52e73aba5"
  },
  {
   "version": 12,
   "file": "g1-storage/migrations/0012_staging_abandonment.sql",
   "digest": "32dc507d874f77f5b56553d9ee46190620544981be5691a6db2878fc2ed06993"
  },
  {
   "version": 13,
   "file": "g1-storage/migrations/0013_source_content.sql",
   "digest": "08f12f2a0112d5e173a254881f28b093f0ca9a6cedeea5a32ec7a7dbf3eb4b18"
  },
  {
   "version": 14,
   "file": "g1-storage/migrations/0014_knowledge_save.sql",
   "digest": "f5f919e82098bb554e5f407145091b7441a05018aa93d96bf902b303198c5bca"
  },
  {
   "version": 15,
   "file": "g1-storage/migrations/0015_knowledge_status.sql",
   "digest": "fc8e9fbd62500ea57a29011c25626b23ae69e20b5376dc67d9f87b98ac5aeb4a"
  },
  {
   "version": 16,
   "file": "g1-storage/migrations/0016_knowledge_correction.sql",
   "digest": "1c82e406c6fb35bedf70a6b204cf5094645cdf8d194ef54f7c4b5d1a6fc07102"
  },
  {
   "version": 17,
   "file": "g1-storage/migrations/0017_artifact_publication.sql",
   "digest": "e2fa2e18f3a20291723ea0d519ad42a2f06dcebfa2229f9c1de31dd56db2d990"
  },
  {
   "version": 18,
   "file": "g1-storage/migrations/0018_volume_drafts.sql",
   "digest": "9610f46e2d3aca03e2f7dffc3d7966353882d902aacf1d05e63ac069d129e543"
  },
  {
   "version": 19,
   "file": "g1-storage/migrations/0019_volume_promotion.sql",
   "digest": "5b27ac6193493ef25d0a3c8764e7fc86d12720fa00f09fb8200be2158cd8a6ae"
  },
  {
   "version": 20,
   "file": "g1-storage/migrations/0020_query_controls.sql",
   "digest": "b2059ab328f700973c04e15a61b000e8dcdec17e1f013cc47bc17dee4f74132d"
  },
  {
   "version": 21,
   "file": "g1-storage/migrations/0021_native_ask.sql",
   "digest": "a9e24c2bafc803950e243e77cccac4627eddbeceb2364b7ea91d4eaea4e56fb8"
  },
  {
   "version": 22,
   "file": "g1-storage/migrations/0022_ask_disclosure.sql",
   "digest": "c3c11655f693a23995e5ebc948802080c6d58d97be5f7ed9445855ee1a79d036"
  },
  {
   "version": 23,
   "file": "g1-storage/migrations/0023_retention_work.sql",
   "digest": "421adc499d872f5fdca104a2fb99775dd2acd08c5c083b7fe09d51b3045469df"
  },
  {
   "version": 24,
   "file": "g1-storage/migrations/0024_dependency_graph.sql",
   "digest": "d5a8028b0e04ec42be778f9b039afab9740486e536154c56705f785419992995"
  },
  {
   "version": 25,
   "file": "g1-storage/migrations/0025_maintenance_admission.sql",
   "digest": "22f64e7f911854f56cd13bb04014dee12a75be0daff391201c4eeed4642ac31c"
  },
  {
   "version": 26,
   "file": "g1-storage/migrations/0026_propagation_retry.sql",
   "digest": "b87492c7df110e2b2af581ac707e0627348773cefb484e18aca99a4a55da74db"
  },
  {
   "version": 27,
   "file": "g1-storage/migrations/0027_backup_confirmation.sql",
   "digest": "8723ad60da66e92cfdc2c8ec682048d47bba0799097fb19efc5f29a51ea77001"
  },
  {
   "version": 28,
   "file": "g1-storage/migrations/0028_restore_activation.sql",
   "digest": "feddad0ecd4486264bd1e3eef715357bbc7a547e3265dbdde0570b6d144f9c16"
  },
  {
   "version": 29,
   "file": "g1-storage/migrations/0029_restore_progress.sql",
   "digest": "40d2e63805609275826e9367814fd352ad88d59863be6f50823136a57d33a2c7"
  }
 ]
} as const;
