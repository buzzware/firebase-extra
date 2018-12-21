'use strict';

const Roles = class Roles {

	// static rolesContain(aRoleList, aRole) {
	// 	var nodeRole = !aRole.includes('.');
	// 	if (nodeRole) {
	// 		return !!aRoleList.find(r => r.split('.').indexOf(aRole)>=0);
	// 	} else {
	// 		return !!aRoleList.find(r => r.startsWith(aRole));
	// 	}
	// }
	//
	// static isMember(aPerson) {
	// 	return this.rolesContain(aPerson.roles, Role.MEMBER_ROLE);
	// }
	//
	// static expandFullRoles(aRoles) {
	// 	if (aRoles && aRoles.length===undefined)
	// 		aRoles = [aRoles];
	// 	var result = [];
	// 	for (let r of aRoles) {
	// 		var nodes = r.split('.');
	// 		for (let n of nodes) {
	// 			if (!result.includes(n))
	// 				result.push(n);
	// 		}
	// 	}
	// 	return result;
	// }

	// returns a list of sorted role names eg. ['manager','member','user','vip']
	static expandRoles(
		aRolesList,	// a list of full roles eg. ['user.member.manager','user.member.vip']
		aSpecRoles	// a list of role names eg. ['manager','vip']
	) {
		if (aSpecRoles && aSpecRoles.length===undefined)
			aSpecRoles = [aSpecRoles];
		var result = [];
		for (let sr of aSpecRoles) {
			for (let lr of aRolesList) {
				var lrnodes = lr.split('.');
				let nodei = lrnodes.indexOf(sr);
				if (nodei < 0)
					continue;
				for (let i = 0; i <= nodei; i++) {
					let n = lrnodes[i];
					if (!result.includes(n))
						result.push(n);
				}
			}
		}
		result.sort();
		return result;
	}
};

export default Roles;
