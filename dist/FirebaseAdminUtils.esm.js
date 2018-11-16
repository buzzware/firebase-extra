import _ from 'lodash';

//const crypto = require('crypto');

var FirebaseAdminUtils = class {

	static encode(v) {
		if (_.isString(v) || _.isNumber(v) || _.isNull(v) || _.isBoolean(v))
			return v;

		if (_.isDate(v))
			return { "timestampValue": v }

		if (_.isArray(v)) {
			var tmp = new Array(v.length); //{"arrayValue": {"values": []}}
			for (var i = 0; i < v.length; i++) {
				tmp[i] = this.encode(v[i]);
			}
			return tmp;
		}

		if (_.isObject(v)) {
			var tmp = {};
			let keys = Object.keys(v);
			for (let k of keys) {
				if (k[0]=='_')
					continue;
				tmp[k] = this.encode(v[k]);
			}
			return tmp;
		}
		return null;
	}

	static getFireStoreProp(value) {
		const props = { 'arrayValue': 1, 'booleanValue': 1, 'geoPointValue': 1, 'integerValue': 1, 'mapValue': 1, 'nullValue': 1, 'referenceValue': 1, 'stringValue': 1, 'timestampValue': 1 };
		return Object.keys(value).find(k => props[k] === 1)
	}

	static decode(value) {
		if (_.isObject(value)) {
			const prop = this.getFireStoreProp(value);
			if (prop === 'integerValue') {
				value = Number(value[prop]);
			}
			else if (prop === 'arrayValue') {
				value = (value[prop].values || []).map(v => this.decode(v));
			}
			else if (prop === 'mapValue') {
				value = this.decode(value[prop].fields);
			}
			else if (prop === 'geoPointValue') {
				value = { latitude: 0, longitude: 0, ...value[prop] };
			}
			else if (prop === 'timestampValue') {
				value = new Date(Date.parse(value[prop]));
			}
			else if (prop) {
				value = value[prop];
			}
			else if (typeof value === 'object') {
				Object.keys(value).forEach(k => value[k] = this.decode(value[k]));
			}
		}
		return value;
	}

	static createModelInternal(aFirebaseAdminApp,input) {
		console.log('createModelInternal');
		console.log(JSON.stringify(input));
		var collection = input.collection;
		var data =  input.data;
		var Firestore = aFirebaseAdminApp.firestore().constructor;
		//var timestamp = firebase.firestore.FieldValue.serverTimestamp();
		//var timestamp = ‌‌admin.firestore.Timestamp.now(); //
		var timestamp = Firestore.Timestamp.now();
		data.created_at = timestamp;
		data.updated_at = timestamp;

		var docRef;
		var req;
		if (data.id) {
			docRef = aFirebaseAdminApp.firestore().collection(collection).doc(data.id);
			return new Promise(function(resolve, reject) {
				docRef.get()
					.catch(reject)
					.then((snap) => {
						if (snap.exists) {
							reject(new Error(`Document ${input.collection}/${input.data} already exists`));
						} else {
							if (_.isObject(data)) {
								console.log(JSON.stringify(data));
								docRef = aFirebaseAdminApp.firestore().collection(collection).doc(data.id);
								docRef.set(data).catch(reject).then(resolve);
							} else if (data===null || data===undefined) {
								resolve();
							} else
								throw Error('Data is of the wrong kind '+typeof(data));
						}
					});
			}).then(() => ({success: true, collection: collection, id: data.id}));
		} else {
			docRef = aFirebaseAdminApp.firestore().collection(collection).doc();
			data.id = docRef.id;
			req = docRef.set(data);
			return new Promise(function(resolve, reject){
				return req.then(() => {
					return resolve({success: true, collection: collection, id: data.id});
				}).catch(reject);
			});
		}
	}

	static updateModelInternal(aFirebaseAdminApp,input) {
		var collection = input.collection;
		var id = input.id;
		var data = Object.assign({},input.data);
		delete data.id;
		delete data.created_at;
		var Firestore = aFirebaseAdminApp.firestore().constructor;
		var timestamp = Firestore.Timestamp.now();
		data.updated_at = timestamp;

		var docRef = aFirebaseAdminApp.firestore().collection(collection).doc(id);
		var promise = new Promise(function(resolve, reject) {
			return docRef.update(data)
				.catch(reject)
				.then(() => {
					return resolve({success: true, collection: collection, id: id});
				});
		});
		return promise;
	}

	static destroyCollectionInternal(aFirebaseAdminApp,input) {
		var collection = input.collection;
		//var FirePromise = aFirebaseAdminApp.this.firebase.firebaseSdk.Promise;

		var request = aFirebaseAdminApp.firestore().collection(collection);

		var promise = new Promise(function (resolve, reject) {
			request.get().catch(reject).then((response) => {
				if (!response || response.empty) {
					resolve([]);
				} else {
					var promises = response.docs.map(d => d.ref.delete().catch(reject).then(() => d.id));
					return Promise.all(promises).catch(reject).then(resolve);
				}
			});
		});
		return promise;
	}

	// static fastHash(aString) {
	// 	const fastHasher = crypto.createHash('sha1');
	// 	const hashed = fastHasher.update(aString);
	// 	const digested = hashed.digest('base64');
	// 	return digested;
	// }

};

export default FirebaseAdminUtils;
