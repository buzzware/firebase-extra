'use strict';

const RoleNode = class RoleNode {
	constructor(aRoles,aFullRole) {
		this.roles = aRoles;
		this.full_role = aFullRole;
	}

	superior(aLeaf) {
		let full = this.full_role+'.'+aLeaf;
		this.roles.add(full);
		return new RoleNode(this.roles,full);
	}
}

const Roles = class Roles {

	static rolesContain(aRoleTree, aRole) {
		var nodeRole = !aRole.includes('.');
		if (nodeRole) {
			return !!aRoleTree.find(r => r.split('.').indexOf(aRole)>=0);
		} else {
			return !!aRoleTree.find(r => r.startsWith(aRole));
		}
	}

	static isMember(aPerson) {
		return this.rolesContain(aPerson.roles, Role.MEMBER_ROLE);
	}

	static expandFullRoles(aRoles) {
		if (aRoles && !Array.isArray(aRoles))
			aRoles = [aRoles];
		var result = [];
		for (let r of aRoles) {
			var nodes = r.split('.');
			for (let n of nodes) {
				if (!result.includes(n))
					result.push(n);
			}
		}
		return result;
	}

	// returns a list of sorted role names eg. ['manager','member','user','vip']
	static expandRoles(
		aRoleTree,	// a list of full roles eg. ['user.member.manager','user.member.vip']
		aSpecRoles	// a list of role names eg. ['manager','vip']
	) {
		if (aSpecRoles && !Array.isArray(aSpecRoles))
			aSpecRoles = [aSpecRoles];
		else if (!aSpecRoles)
			aSpecRoles = [];
		var result = [];
		for (let sr of aSpecRoles) {
			for (let lr of aRoleTree) {
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

	static leaf(aFullRole) {
		if (!aFullRole)
			return null;
		var lrnodes = aFullRole.split('.');
		if (!lrnodes.length)
			return null;
		return lrnodes[lrnodes.length-1];
	}

	// add a full role to the tree. Probably should use root and/or superior instead
	static add(aFullRole) {
		this.tree.push(aFullRole);
	}

	// add a root node to the tree and return a node to use superior()
	static root(aLeaf) {
		let node = new RoleNode(this,aLeaf);
		this.add(aLeaf);
		return node;
	}

	static fullRole(aSpecRole,aRoleTree) {
		if (aSpecRole.includes('.'))
			return aSpecRole;
		for (let tr of aRoleTree) {
			var trnodes = tr.split('.');
			let nodei = trnodes.indexOf(aSpecRole);
			if (nodei >= 0)
				return trnodes.slice(0, nodei + 1);
		}
	}

};

Roles.tree = [];


export default Roles;
