'use strict';

import FirebaseExtra from './FirebaseExtra';
import FirebaseAdminUtils from './FirebaseAdminUtils';

var isNode = (typeof module !== 'undefined' && typeof module.exports !== 'undefined');

var FirebaseExtraAdmin = class extends FirebaseExtra {

	constructor(config, firebaseSdk, adminSdk, serviceCredentials) {
		super(config, firebaseSdk);

// If you are using the Node.js Admin SDK in a Cloud Function, you can automatically initialize the SDK through the functions.config() variable:
// var app = admin.initializeApp(functions.config().firebase);

		this.adminSdk = adminSdk;
		// '[DEFAULT]' must exist for some API methods that use the default instance
		var appname = this.adminSdk.apps.find(a=>a.name=='[DEFAULT]') ? config.projectId+'-admin'+Math.random().toString().replace('0.','-') : '[DEFAULT]';
		var options = {
			credential: this.adminSdk.credential.cert(serviceCredentials),
			databaseURL: config.databaseURL
		};
		this.adminApp = this.adminSdk.initializeApp(options,appname);
		//this.adminApp.firestore().settings({timestampsInSnapshots: true});
	}

	dispose() {
		super.dispose();
		if (this.adminApp) {
			this.adminApp.delete();
			this.adminApp = null;
		}
	}

	get hostUrl() {
		return `https://${this.config.publicHost}`;
	}

	get firestore() {
		if (!this.adminApp)
			return super.firestore;
		return this.adminApp.firestore();
	}

  get serverTimestamp() {
    return this.adminSdk.firestore.FieldValue.serverTimestamp();
  }

  get deleteFieldValue() {
    return this.adminSdk.firestore.FieldValue.delete();
  }

	get adminAuth() {
		if (!this.adminSdk || !this.adminApp) // properties are read before init or create, so we return null and don't crash when no adminSdk
			return null;
		return this.adminSdk.auth(this.adminApp);
	}

	getUser(uid) {
		return FirebaseExtra.timeout(
			new Promise((resolve, reject) => {
				this.adminAuth.getUser(uid)
					.catch((e) => {
						if (!e.errorInfo || e.errorInfo.code != 'auth/user-not-found') {
							console.log(e.message);
							reject(e);
						} else {
							resolve(null);
						}
					})
					.then(resolve)
			}),
			this.timeoutms
		);
	}

	deleteUser(uid) {
		return FirebaseExtra.timeout(
			new Promise((resolve, reject) => {
				this.adminAuth.deleteUser(uid)
					.catch((e) => {
						if (!e.errorInfo || e.errorInfo.code != 'auth/user-not-found') {
							console.log(e.message);
							reject(e);
						} else {
							resolve(null);
						}
					})
					.then(resolve)
			}),
			this.timeoutms
		);
	}

	getUserByEmail(email) {
		return FirebaseExtra.timeout(
			new Promise((resolve, reject) => {
				this.adminAuth.getUserByEmail(email)
					.catch((e) => {
						if (!e.errorInfo || e.errorInfo.code != 'auth/user-not-found') {
							console.log(e.message);
							reject(e);
						} else {
							resolve(null);
						}
					})
					.then(resolve)
			}),
			this.timeoutms
		);
	}

	getUserByPhoneNumber(phone) {
		return FirebaseExtra.timeout(
			new Promise((resolve, reject) => {
				this.adminAuth.getUserByPhoneNumber(phone)
					.catch((e) => {
						if (!e.errorInfo || e.errorInfo.code != 'auth/user-not-found') {
							console.log(e.message);
							reject(e);
						} else {
							resolve(null);
						}
					})
					.then(resolve)
			}),
			this.timeoutms
		);
	}

	updateUser(uid,changes) {
		var result = this.adminAuth.updateUser(uid,changes);
		return FirebaseExtra.timeout(result,this.timeoutms);
	}

	// This seems to be necessary, otherwise I was getting weirdness awaiting on createUserWithEmailAndPassword
	createUser(aFields) {
		var result = this.adminAuth.createUser(aFields);
		return FirebaseExtra.timeout(result,this.timeoutms);
	}

	forAllUsers(callback,batchCount=50,batchTimeoutms=30000,nextPageToken=undefined) {
		// List batch of users, 1000 at a time.

		let firebasePromise = this.adminAuth.listUsers(batchCount, nextPageToken)
			.then(async (listUsersResult) => {
				for (let u of listUsersResult.users)
					await callback(u);
				if (listUsersResult.pageToken)
					await this.forAllUsers(callback,batchCount,batchTimeoutms,listUsersResult.pageToken);
			});
		return FirebaseExtra.timeout(firebasePromise,batchTimeoutms);
	}

	async destroyAllUsers() {
		let uidBatch = [];
		await this.forAllUsers(async (user)=> {
			uidBatch.push(user.uid);
			if (uidBatch.length>=10) {
				let deleteUids = uidBatch;
				uidBatch = [];
				await Promise.all(deleteUids.map((uid)=>this.deleteUser(uid)));
			}
		},10,60000);
		await Promise.all(uidBatch.map((uid)=>this.deleteUser(uid)));
	}

	calcDisplayName(aUserOrDetails) {
		var displayName = null;
		if (aUserOrDetails.first_name || aUserOrDetails.last_name)
			displayName = `${aUserOrDetails.first_name} ${aUserOrDetails.last_name}`;
		else if (aUserOrDetails.email)
			displayName = aUserOrDetails.email;
		else if (aUserOrDetails.phoneNumber)
			displayName = aUserOrDetails.phoneNumber;
		else if (aUserOrDetails.uid)
			displayName = uid;
		return displayName;
	}

	createCustomToken(aUid, aClaims) {
		let promise = new Promise((resolve, reject) => {
			this.adminAuth.createCustomToken(aUid, aClaims).then(resolve,reject);
		});
		return FirebaseExtra.timeout(promise,this.timeoutms);
	}

	createSessionCookie(aIdToken,expiresInms) {
		let promise = new Promise((resolve, reject) => {
			this.adminAuth.createSessionCookie(aIdToken, {expiresIn: expiresInms}).then(resolve,reject);
		});
		return FirebaseExtra.timeout(promise,this.timeoutms);
	}

	verifySessionCookie(aCookie,aCheckRevoked) {
		let promise = new Promise((resolve, reject) => {
			this.adminAuth.verifySessionCookie(aCookie,aCheckRevoked).then(resolve,reject);
		});
		return FirebaseExtra.timeout(promise,this.timeoutms);
	}

	verifyIdToken(aIdToken,aCheckRevoked) {
		let promise = new Promise((resolve, reject) => {
			this.adminAuth.verifyIdToken(aIdToken,aCheckRevoked).then(resolve,reject);
		});
		return FirebaseExtra.timeout(promise,this.timeoutms);
	}

	setCustomUserClaims(uid,claims) {
		let promise = this.adminAuth.setCustomUserClaims(uid,claims);
		return FirebaseExtra.timeout(promise,30000);
	}

	// this is for convenience. It will be more efficient to use the user customClaims property directly if you have a user record
	getCustomUserClaims(uid) {
		let promise = this.adminAuth.getUser(uid).then(u => u.customClaims);
		return FirebaseExtra.timeout(promise,30000);
	}

	verifyIdTokenAndGetClaims(aToken) {
		let promise = this.adminAuth.verifyIdToken(aToken);
		return FirebaseExtra.timeout(promise,30000);
	}

	// create a FirebaseExtra client impersonating the given uid
	async clientForUser(uid,claims=null) {
		let customToken = await (claims ? this.createCustomToken(uid,claims) : this.createCustomToken(uid));
		let client = new FirebaseExtra(this.config,this.firebaseSdk);
		let userCredential = await client.auth.signInWithCustomToken(customToken);
		return client;
	}

	async expandSpecifiedRolesToUserClaim(aRoleTree,aUid,aSpecRoles) {
		let allRoles = FirebaseExtraAdmin.Roles.expandRoles(aRoleTree,aSpecRoles);
		let claims = await this.getCustomUserClaims(aUid);
		claims = Object.assign({},claims,{roles: allRoles});
		await this.setCustomUserClaims(aUid,claims);
		return allRoles;
	}



	//
	// Deprecated Methods
	//

	//use modelCreate
	createModel(aCollection,aData) {
		return FirebaseExtra.timeout(FirebaseAdminUtils.createModelInternal(this.adminApp,{collection: aCollection,data: aData}),this.timeoutms);
	}

	//use modelUpdate
	updateModel(aCollection,aId,aData) {
		return FirebaseExtra.timeout(FirebaseAdminUtils.updateModelInternal(this.adminApp,{collection: aCollection,id: aId, data: aData}),this.timeoutms);
	}

	destroyAll(aCollection) {
		return FirebaseExtra.timeout(FirebaseAdminUtils.destroyCollectionInternal(this.adminApp,{collection: aCollection}),this.timeoutms);
	}

	async ensureUserAndPerson(aDetails) {
		aDetails = Object.assign({},aDetails);
		console.log('ensureUserAndPerson ' + aDetails.email);
		var {email, password, phoneNumber, photoURL, person} = aDetails;
		person = person || {};
		var user = null;

		var email_user = email && await this.getUserByEmail(email);

		var phone_user = phoneNumber && await this.getUserByPhoneNumber(phoneNumber);

		if (email_user && phone_user && email_user.uid == phone_user.uid) { // both pre-existing and the same, so no problem
			user = phone_user;
		} else if (phone_user) {
			if (email_user) {       // email pre-existing, so remove references to email user and work with phone_user
				email = undefined;
				aDetails.email = undefined;
			}
			user = phone_user;
		} else if (email_user) {
			if (phone_user) {       // phone pre-existing, so remove references to phone user and work with phone_user
				phoneNumber = undefined;
				aDetails.phoneNumber = undefined;
			}
			user = email_user;
		}

		if (user) {
			let updates = {};
			if (email && email!=user.email)
				updates.email = email;
			if (password)
				updates.password = password;
			if (phoneNumber && phoneNumber!=user.phoneNumber)
				updates.phoneNumber = phoneNumber;
			if (photoURL && photoURL!=user.photoURL)
				updates.photoURL = photoURL;
			if (!user.displayName || aDetails.displayName!=user.displayName) {
				let displayName = aDetails.displayName || this.calcDisplayName(Object.assign({}, user, aDetails, person));
				if (displayName && displayName!=user.displayName)
					updates.displayName = displayName;
			}
			if (Object.keys(updates).length)
				user = await this.updateUser(user.uid, updates);
		}

		if (user == null) {
			try {
				//let createRequest = new this.adminSdk.auth.CreateRequest(aDetails);
				let createRequest = {email,password,phoneNumber,photoURL};
				let displayName = this.calcDisplayName(Object.assign({},aDetails,person));
				if (displayName)
					createRequest.displayName = displayName;
				user = await this.createUser(createRequest);
				console.log('user created');
			} catch (e) {
				console.log(e.message);
			}
		}

		var person_id = user.uid;
		var key = "Person__" + person_id;
		var dbPerson = await this.kojacKeyGet(key);
		if (!dbPerson) {
			dbPerson = {
				uid: person_id
			};
			await this.kojacKeySet(key, dbPerson);
		}
		var person_updates = {};
		for (let k of Object.keys(person)) {
			if (dbPerson[k]!==person[k])
				person_updates[k] = person[k];
		}
		await this.kojacKeyUpdate(key, person_updates);

		return {
			user: user,
			person_key: key,
			uid: user.uid
		};
	}

};

FirebaseExtraAdmin.timeout = FirebaseExtra.timeout;
FirebaseExtraAdmin.TimeoutError = FirebaseExtra.TimeoutError;
FirebaseExtraAdmin.Roles = FirebaseExtra.Roles;

export default FirebaseExtraAdmin;
