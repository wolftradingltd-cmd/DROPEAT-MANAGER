-- ============================================================
-- IMPORT AGENTS COMMERCIAUX (auto-généré)
-- Source : 28 agents uniques
-- Mot de passe = seller_code (à transmettre à chaque agent)
-- ============================================================

-- Désactiver temporairement la contrainte parent_id : on insère
-- d'abord tous les agents avec parent_id NULL, puis on patche en 2ᵉ passe.

BEGIN TRANSACTION;

-- Table permanente de mapping UUID_source → user_id local
-- (D1 n'autorise pas les TEMP tables — on en crée une normale, droppée en fin de transaction)
DROP TABLE IF EXISTS _import_map;
CREATE TABLE _import_map (
  uuid_source TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  seller_code TEXT NOT NULL,
  parent_uuid TEXT
);

-- ===== PASSE 1 : insertion des users (parent_id NULL temporairement) =====
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('saezstyve+saez0613@gmail.com', 'pbkdf2$100000$46cc32117a91b810d934f04ffabd1062$21756219c989ee6d6748102862386efc2e7800ed8acfd9c9d14110c91d6b9d09', 'agent', 'Saez', 'Steve', '0613688798', 1, NULL, 1, 'Import 2026-05-13 | uuid:0333e5fc-eb61-4d4c-8608-c6934c756d0b | email_orig:saezstyve@gmail.com', '2026-04-13 10:28:01.425');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('0333e5fc-eb61-4d4c-8608-c6934c756d0b', last_insert_rowid(), 'SAEZ0613', 'a84e1960-0313-4ac9-bf63-53662f0db0af');
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('timevideocontact@gmail.com', 'pbkdf2$100000$4c03139badde654696121756e0bc8396$71f0dfde9c9f9598fde0660379cd785edee69920843e7889abfe82f4c4c3dcda', 'agent', 'Antoni', 'Brendan', '0629644457', 2, NULL, 1, 'Import 2026-05-13 | uuid:33075354-c33a-4401-b178-09878aca7446 | markets:FR', '2026-03-24 12:12:59.064');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('33075354-c33a-4401-b178-09878aca7446', last_insert_rowid(), 'BA2026', '49010ce3-4dac-438c-8597-bf2ea3fae87e');
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('kamelmarketeur@gmail.com', 'pbkdf2$100000$5fe6075ecd5ba34ace6eda845831c0c5$25aae5782e6d75725eb50c9188c6568d9b37791e64f5086b42054c5a5d5cf378', 'agent', 'Mehdi', 'Kamel', '+33 6 59 31 94 11', 1, NULL, 1, 'Import 2026-05-13 | uuid:49010ce3-4dac-438c-8597-bf2ea3fae87e', '2026-03-21 12:30:47.494');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('49010ce3-4dac-438c-8597-bf2ea3fae87e', last_insert_rowid(), 'SNACKSOLUTION26', 'a84e1960-0313-4ac9-bf63-53662f0db0af');
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('sabrinahadri.succes@gmail.com', 'pbkdf2$100000$1593dfedba289ed23438f85489ab0ec1$91a8be8739fc722248574af64fb1468072455d0e4ba0463a7265f8699502083c', 'agent', 'Hadri', 'Sabrina', '0615263644', 1, NULL, 1, 'Import 2026-05-13 | uuid:11c377c3-b46e-4ece-946e-7c1313eb868c', '2026-03-17 07:59:57.350');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('11c377c3-b46e-4ece-946e-7c1313eb868c', last_insert_rowid(), 'SH143115', 'a84e1960-0313-4ac9-bf63-53662f0db0af');
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('developpement.restaurent@gmail.com', 'pbkdf2$100000$ef15891e8079cfe909d9f81618ec4666$29ede33c4d8b3316afae48c7aa5a42547846fc6a5bfb277cbf7d5076bda81f9f', 'agent', 'Garcia', 'Sébastien', '0698251235', 0, NULL, 1, 'Import 2026-05-13 | uuid:a84e1960-0313-4ac9-bf63-53662f0db0af | markets:FR', '2026-03-16 12:04:21.482');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('a84e1960-0313-4ac9-bf63-53662f0db0af', last_insert_rowid(), 'GARCIA001', NULL);
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('succeslife4.0@gmail.com', 'pbkdf2$100000$8f80073145d1208725cb5adcef652062$6d2f51c653dcb47a3c6a971f77df605808f7510c8add7d3d0fe8a0ae56b0d0fe', 'agent', 'Michaux', 'Marie', '0637722712', 1, NULL, 1, 'Import 2026-05-13 | uuid:aed3f55c-7bc4-4810-a72a-9092c233e43b | hide_upline', '2026-03-16 08:56:46.450');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('aed3f55c-7bc4-4810-a72a-9092c233e43b', last_insert_rowid(), 'MAKIE', 'a84e1960-0313-4ac9-bf63-53662f0db0af');
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('thomas.martin@demo.com', 'pbkdf2$100000$a4fd5a656c5b61047d694e328702b4d5$9332b196c289639294c46e298daf737e78e07d9b5a62ba2a824e1988e13afa8e', 'agent', 'Martin', 'Thomas', NULL, 0, NULL, 1, 'Import 2026-05-13 | uuid:0e6d4c97-eae3-4681-b281-4d23f3a9ca6e | markets:FR', '2026-03-12 10:00:00.000');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('0e6d4c97-eae3-4681-b281-4d23f3a9ca6e', last_insert_rowid(), 'AGT001', NULL);
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('naturallygoodgoodies@gmail.com', 'pbkdf2$100000$bf38062f1e1dec4769423fbe0e34b01c$9be5f53e7312502235679defd22fdc9b81934ca42c7112759aa05d770cef1c2e', 'agent', 'Awonuga', 'Olu', '07876742523', 0, NULL, 1, 'Import 2026-05-13 | uuid:9583f934-b288-4e2f-ba35-3969deb55b14 | markets:UK', '2026-05-01 16:04:19.657');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('9583f934-b288-4e2f-ba35-3969deb55b14', last_insert_rowid(), 'AGT007', NULL);
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('noahnsaez@gmail.com', 'pbkdf2$100000$10c545668a878a6baadc0169103ee2e1$55c9d447ab5f9f277258bea9ea362d89b0565e82218cd043e395e5209d3fecc8', 'agent', 'Saez', 'Noahn', '0628567497', 2, NULL, 1, 'Import 2026-05-13 | uuid:60101462-5627-40b1-af54-61ef1a6b271b | markets:FR', '2026-04-24 07:08:45.843');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('60101462-5627-40b1-af54-61ef1a6b271b', last_insert_rowid(), 'SAEZ001', '0333e5fc-eb61-4d4c-8608-c6934c756d0b');
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('kevin.rivierebaeza@gmail.com', 'pbkdf2$100000$8581db45486eeedbb2daf4de4e049326$830a65be0ea8fee0a5bfa7545c48ac8aa37d035185dfad4ab46e6641261d9c2c', 'agent', 'Riviere', 'Kevin', NULL, 2, NULL, 1, 'Import 2026-05-13 | uuid:4a9f3b5f-0b54-494e-847e-8258c459222a', '2026-04-22 14:19:45.883');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('4a9f3b5f-0b54-494e-847e-8258c459222a', last_insert_rowid(), 'K2026', '33075354-c33a-4401-b178-09878aca7446');
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('fafaginou@live.fr', 'pbkdf2$100000$e5554836419497e7d1fcb4367aa059f7$39b64df2140c0f78d0160fe6424aaa0df8eb440de7c193b84ac2494133d2c03d', 'agent', 'Rosso', 'Fabien', '0663672844', 1, NULL, 1, 'Import 2026-05-13 | uuid:2822a638-0ce2-428a-b59e-19857a570c56', '2026-04-22 09:57:27.200');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('2822a638-0ce2-428a-b59e-19857a570c56', last_insert_rowid(), 'FAB13', 'a84e1960-0313-4ac9-bf63-53662f0db0af');
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('moielbac@gmail.com', 'pbkdf2$100000$70945fde13f08b292a7f7f499626a79d$874d87375cf9c274f6cea19b557b9eba8f8a127c638ddadddd013ebe1afb363a', 'agent', 'Haidar Mohamed', 'Elbac', '0666095405', 0, NULL, 1, 'Import 2026-05-13 | uuid:5952825c-3866-4b6d-b10d-08c0a1324d9e | markets:FR', '2026-04-21 13:11:14.960');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('5952825c-3866-4b6d-b10d-08c0a1324d9e', last_insert_rowid(), 'ELBAC_976', NULL);
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('hadri.gregory@gmail.com', 'pbkdf2$100000$b80a974f2f32070d09feb378e9f284c4$aad9f69ddfcee9693af682eca62d6a3c2b801b8682b90046acd5e4f76256d231', 'agent', 'Hadri', 'Gregory', '0769696138', 2, NULL, 1, 'Import 2026-05-13 | uuid:bf66b0c5-f654-43a0-b7b6-1b6539b879b6 | markets:FR', '2026-04-13 19:00:18.585');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('bf66b0c5-f654-43a0-b7b6-1b6539b879b6', last_insert_rowid(), 'GREGEAT', '11c377c3-b46e-4ece-946e-7c1313eb868c');
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('saezstyve+saez0610@gmail.com', 'pbkdf2$100000$f71dba2500b7082d2166fab041dd0b71$1b6b9aa176e5b1ffa101e0572d22b94eb05c3ad6321d481a8a19b4f1bd82dd6b', 'agent', 'Saez', 'Styve', '0613688798', 0, NULL, 1, 'Import 2026-05-13 | uuid:c2bcb29e-beef-4a15-8299-4cd119c93bbb | markets:FR | email_orig:saezstyve@gmail.com', '2026-04-13 09:35:24.089');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('c2bcb29e-beef-4a15-8299-4cd119c93bbb', last_insert_rowid(), 'SAEZ0610', NULL);
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('benhasna.hocine@hotmail.fr', 'pbkdf2$100000$3b6c034ca40a150c6c5d32570c1210c8$49ee5ad6c0e6e8c6962bfd2efa33ef1759b07493115a9e687649b694b3d582e8', 'agent', 'Benhasna', 'Hocine', '0762151182', 2, NULL, 1, 'Import 2026-05-13 | uuid:1a40c967-a5bd-4f1a-bb51-70ff12122630', '2026-04-08 10:49:10.488');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('1a40c967-a5bd-4f1a-bb51-70ff12122630', last_insert_rowid(), 'HOCINEOPT', '49010ce3-4dac-438c-8597-bf2ea3fae87e');
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('aadssisofia41@gmail.com', 'pbkdf2$100000$45b20341380700ab8fad5cd2c3ce462e$cc09ce4d5d58372ccd5df1df822a0331e34219e94beabad833f8dbcab541a17b', 'agent', 'Aadssi', 'Sofia', '0745235613', 0, NULL, 1, 'Import 2026-05-13 | uuid:b7a78d9e-52c2-4aba-ab43-941265cdab03 | markets:FR', '2026-04-07 11:17:29.867');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('b7a78d9e-52c2-4aba-ab43-941265cdab03', last_insert_rowid(), '3', NULL);
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('aadssisofia@gmail.com', 'pbkdf2$100000$338cb7368bd5f59bbf837a871025295b$ae903c0ccbd3cf204534c27d55b1af069f9250762f8c36a3d2bd8159e388243b', 'agent', 'Aadssi', 'Sofia', '0745235613', 0, NULL, 1, 'Import 2026-05-13 | uuid:44bf7166-5c7f-4742-b10a-528bf94862e1 | markets:FR', '2026-04-07 11:17:28.870');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('44bf7166-5c7f-4742-b10a-528bf94862e1', last_insert_rowid(), '3', NULL);
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('thibaut.picard@edhec.com', 'pbkdf2$100000$c436e092128c8a77f2141126be41d851$a8fb858684a6aef0db8262bf640ce25d0ddebe07e29f5254d63bb95b9159e538', 'agent', 'PICARD', 'Thibaut', '0786056152', 0, NULL, 1, 'Import 2026-05-13 | uuid:75c84c4c-b8c8-497d-b470-67b4215d81d1 | markets:FR', '2026-03-30 20:40:57.295');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('75c84c4c-b8c8-497d-b470-67b4215d81d1', last_insert_rowid(), 'LION4', NULL);
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('xasoandcoflo@orange.fr', 'pbkdf2$100000$01ee3e5d215a4d20e66ce386a8085a77$c144b103b1e3ed45bec997a3730a52300fd274a42e08f82dd29b8f3d4c5ddf50', 'agent', 'FRUGIER', 'XAVIER', '0771708637', 0, NULL, 1, 'Import 2026-05-13 | uuid:98367090-46db-4673-9792-66bb297a9198 | markets:FR', '2026-03-23 15:50:25.964');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('98367090-46db-4673-9792-66bb297a9198', last_insert_rowid(), 'XAVIER.F', NULL);
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('obhamou@gmail.com', 'pbkdf2$100000$68aec0a5746a2673f6a69b6e028064f1$6eef6703854cbc9d3c12d405bef8c190fd1871e18112422dc9436894c6015ffb', 'agent', 'OULD BESSI', 'Hamou', '0646848414', 0, NULL, 1, 'Import 2026-05-13 | uuid:82623ada-a4f2-4b83-8a5a-8d7f0156f621 | markets:FR', '2026-03-23 08:26:15.515');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('82623ada-a4f2-4b83-8a5a-8d7f0156f621', last_insert_rowid(), 'OBH1827', NULL);
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('elka.kane78@gmail.com', 'pbkdf2$100000$7db73e2e3f8edc5a0482b55c60e70111$d0bb57ba659c5e2dd7e65d66dda228b87131969693fcbb1d38984c80f4353cab', 'agent', 'Kane', 'Elimane', '0758769799', 0, NULL, 1, 'Import 2026-05-13 | uuid:71856670-d88b-4e50-9f0f-6159dbd98be7 | markets:FR', '2026-03-23 08:13:52.238');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('71856670-d88b-4e50-9f0f-6159dbd98be7', last_insert_rowid(), 'EK22', NULL);
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('qntndurand@gmail.com', 'pbkdf2$100000$ff1608aa2e92646f9fb14f635f6783c4$0a96bc1202542aae40055c59d223e3e2012c86b1d9e6f83398f2b3ee201866a5', 'agent', 'Durand', 'Quentin', '0767419633', 0, NULL, 1, 'Import 2026-05-13 | uuid:3db5031b-8807-4283-90ea-70b6469129dd', '2026-03-17 12:35:59.739');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('3db5031b-8807-4283-90ea-70b6469129dd', last_insert_rowid(), 'QUENTIN27', NULL);
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('jeremykahloun99@gmail.com', 'pbkdf2$100000$ec58932bcb212ca76828ec1757b4f10c$d8648efee97673fcb08bc8c64b18a94508eaf788ada0a04e0836e308e90f729c', 'agent', 'kahloun', 'jeremy', '0650287197', 0, NULL, 1, 'Import 2026-05-13 | uuid:b48a6e06-d5d2-4574-aa3a-07f68898c613', '2026-03-16 16:04:26.753');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('b48a6e06-d5d2-4574-aa3a-07f68898c613', last_insert_rowid(), 'FOR222', NULL);
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('noemie.dropshipeat@gmail.com', 'pbkdf2$100000$755e5c757ec93ad378a5f8c84144a9d9$e0aaaaf0f54b16bacd870c5f961ad99e4aab69d3b55c5973ff4d6a7d8730eb66', 'agent', 'Frachisse', 'Noémie', '0664081797', 0, NULL, 1, 'Import 2026-05-13 | uuid:90112ce6-199a-4844-b55b-d100531adc1f | markets:FR', '2026-03-16 12:49:30.136');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('90112ce6-199a-4844-b55b-d100531adc1f', last_insert_rowid(), 'DNA242', NULL);
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('sct.iron@gmail.com', 'pbkdf2$100000$2bc240f44810df4cb9e854c2c04d3ead$d2fea52002206eee0a8bd6f54081b8ac0e73b461868421dae4feff9fa76ff4ab', 'agent', 'Innocent', 'Takarina', '0684458054', 2, NULL, 1, 'Import 2026-05-13 | uuid:c45ada44-a048-4383-99d0-b300034835bc', '2026-03-16 09:05:59.945');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('c45ada44-a048-4383-99d0-b300034835bc', last_insert_rowid(), 'TAKA', 'aed3f55c-7bc4-4810-a72a-9092c233e43b');
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('pascaljimenez0@gmail.com', 'pbkdf2$100000$5497ae467d1f07ade8ea9d611ea16250$b1486f1b5bfd129a8fcd59486e645a6a2852d66a9341d9e33f43a9c8c26fe59c', 'agent', 'Jimenez', 'Pascal', '0786293050', 0, NULL, 1, 'Import 2026-05-13 | uuid:bda9a10b-be1c-4aec-bef9-7d5097a10685 | markets:FR', '2026-03-13 12:33:19.245');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('bda9a10b-be1c-4aec-bef9-7d5097a10685', last_insert_rowid(), 'PASCAL JIMENEZ', NULL);
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('notreviemoinschere@gmail.com', 'pbkdf2$100000$191d24d4036022118a90687e29237abc$68e248271f23f9d669ad88d09e00d4843c37456d1559b154d618375e4be8d6f1', 'agent', 'Peureux', 'Damien', '0601364361', 1, NULL, 1, 'Import 2026-05-13 | uuid:1c7459d5-a3b9-4a01-9f2d-ec24c96bed50', '2026-03-13 11:01:49.665');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('1c7459d5-a3b9-4a01-9f2d-ec24c96bed50', last_insert_rowid(), 'AT7', '0e6d4c97-eae3-4681-b281-4d23f3a9ca6e');
INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) VALUES ('wolftradingltd@gmail.com', 'pbkdf2$100000$5e1192e796378eed0f3b93e8045161df$d4407ac24748c5f7b3275a10d625256f2a9c6b4ae90e379f6e366e0f6beedd4a', 'agent', 'Trading', 'Wolf', NULL, 1, NULL, 1, 'Import 2026-05-13 | uuid:717bae1c-cbe3-4921-bd2d-0550aa067dda | markets:UK,FR | hide_upline', '2026-03-12 23:12:39.445');
INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) VALUES ('717bae1c-cbe3-4921-bd2d-0550aa067dda', last_insert_rowid(), 'SAN', '0e6d4c97-eae3-4681-b281-4d23f3a9ca6e');

-- ===== PASSE 2 : rétablit la hiérarchie parent_id via le mapping =====
UPDATE users
   SET parent_id = (
     SELECT pm.user_id
       FROM _import_map cm
       JOIN _import_map pm ON pm.uuid_source = cm.parent_uuid
      WHERE cm.user_id = users.id
   )
 WHERE users.id IN (
   SELECT user_id FROM _import_map WHERE parent_uuid IS NOT NULL
 );

-- ===== PASSE 3 : enregistre le seller_code comme code d'accès =====
INSERT INTO codes_acces (user_id, cree_par_id, password_temporaire, affiche, utilise, expire_at, created_at)
SELECT user_id, NULL, seller_code, 0, 0, datetime('now', '+365 day'), CURRENT_TIMESTAMP
  FROM _import_map;

-- ===== PASSE 4 : audit log de l'import =====
INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
SELECT 1, 'import_agents', 'user', user_id,
       '{"source":"agents_externes","uuid":"' || uuid_source || '","seller_code":"' || seller_code || '"}'
  FROM _import_map;

DROP TABLE _import_map;
COMMIT;
