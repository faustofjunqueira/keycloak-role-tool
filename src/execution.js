const _ = require("lodash");
const ora = require("ora");
const { loadFile } = require("./loadFile");
const { createKeycloak } = require("./keycloak");
const { getLogger } = require("log4js");
const { Environment } = require("./environment");
const { loadProfiles } = require("./profile");

const logger = getLogger("EXECUTION");

class CreateRolesProcess {
  constructor(spinner, kc, clients, clientName, roles, reset, drop) {
    this.kc = kc;
    this.clients = clients;
    this.clientOwnId = clientName === "realm" ? null : clients[clientName];
    this.roles = roles;
    this.reset = reset;
    this.clientName = clientName;
    this.spinner = spinner;
    this.drop = drop;

    this.regexRole = /^<([A-Za-z0-9\-_]+)>(.+)/;
  }

  log(message) {
    this.spinner.text = message;
  }

  async run() {
    if (this.reset || this.drop) {
      this.log("Deleting all: " + this.clientName);
      await this.deleteAll();
    }
    if(this.drop) {
      return true;
    }
    const updatedActions = [];
    updatedActions.push(await this.insertAndRemoveRoles());
    updatedActions.push(await this.applyComposites());
    return updatedActions.reduce((tot, cur) => tot || cur, false);
  }

  indexClients(clients) {
    return clients.reduce((tot, cur) => ({ ...tot, [cur.name]: cur.id }), {});
  }

  indexRoles(roles) {
    return roles.reduce((tot, cur) => ({ ...tot, [cur.name]: cur }), {});
  }

  plainByRoles(roles) {
    return _.flattenDeep(
      roles.map((x) => {
        if (typeof x === "string") {
          return x;
        }
        const arr = this.plainByRoles(x.roles);
        arr.push(x.name);
        return arr;
      })
    );
  }

  plainByComposite(roles) {
    return _.flattenDeep(
      roles
        .filter((x) => typeof x !== "string")
        .map((x) => {
          const arr = this.plainByComposite(x.roles);
          arr.push({
            name: x.name,
            roles: x.roles.map((y) => (typeof y === "string" ? y : y.name)),
          });
          return arr;
        })
    );
  }

  deleteAll() {
    return this.getAllRoles(this.clientOwnId)
      .then((remoteRoles) =>
        Promise.all(
          remoteRoles.map(({ name }) =>
            this.kc.role.delete(this.clientOwnId, name)
          )
        )
      );
  }

  async insertAndRemoveRoles() {
    const localRoles = this.plainByRoles(this.roles).map((name) => ({
      name,
      attributes: { mergeTool: ["true"] },
    }));
    const remoteRoles = await this.getAllRoles(this.clientOwnId);
    const rolesToInsert = _.differenceBy(localRoles, remoteRoles, "name");
    const rolesToRemove = _.differenceBy(remoteRoles, localRoles, "name");

    // Removendo
    await Promise.all(
      rolesToRemove
        .filter((r) => !this.regexRole.test(r.name))
        .map((r) => {
          return this.delete(this.clientOwnId, r.name)
            .then(() => this.log("Deleted role " + r.name + " with success"))
            .catch(() =>
              logger.error("Deleted role " + r.name + " with error")
            );
        })
    );

    // Inserindo
    await Promise.all(
      rolesToInsert
        .filter((r) => !this.regexRole.test(r.name))
        .map((r) => {
          return this.insertRoles(r)
            .then(() =>
              this.log("Inserted role " + r.name + " with success")
            )
            .catch(() =>
              logger.error("Inserted role " + r.name + " with error")
            );
        })
    );

    return rolesToRemove.length || rolesToInsert.length;
  }

  async applyComposites() {
    const allClientRoles = {
      [this.clientOwnId]: this.indexRoles(
        await this.getAllRoles(this.clientOwnId)
      ),
    };

    const compositeRoles = this.plainByComposite(this.roles);

    const didAnything = await Promise.all(
      compositeRoles.map((x) => this.addOrRemoveComposite(x, allClientRoles))
    );

    return didAnything.reduce((tot, cur) => tot || cur, false);
  }

  async getRemoteRole(rawRole, allClientsRoles) {
    const roleMatch = this.regexRole.exec(rawRole);
    let clientIdName = this.clientOwnId;
    let role = rawRole;
    if (roleMatch) {
      const [_, clientIdNameInRegex, roleInRegex] = roleMatch;
      clientIdName = clientIdNameInRegex;
      role = roleInRegex;
    }

    if (!allClientsRoles[clientIdName]) {
      allClientsRoles[clientIdName] = await this.loadRemoteRole(clientIdName);
    }
    const loadedRole = allClientsRoles[clientIdName][role];
    if (!loadedRole) {
      throw new ReferenceError("Not found [" + rawRole + "] role");
    }
    return loadedRole;
  }

  async loadRemoteRole(clientIdName) {
    const clients = await this.kc.clients.getByClientId(clientIdName);
    if (!(clients && clients.length)) {
      throw new ReferenceError("Not found client " + clientIdName);
    }
    return this.indexRoles(await this.kc.role.get(clients[0].id));
  }

  async addOrRemoveComposite(localComposite, allClientRoles) {
    for (let r in localComposite.roles) {
      localComposite.roles[r] = await this.getRemoteRole(
        localComposite.roles[r],
        allClientRoles
      );
    }

    const remoteComposite = allClientRoles[this.clientOwnId];

    // Se a role nao é composite, entao é apenas adicionar tudo
    if (!remoteComposite[localComposite.name].composite) {
      await this.kc.role.addComposite(
        this.clientOwnId,
        localComposite.name,
        localComposite.roles
      );
      return true;
    }

    const localRoles = localComposite.roles;
    const remoteRoles = await this.kc.role.getComposite(
      this.clientOwnId,
      localComposite.name
    );
    const rolesToInsert = _.differenceBy(localRoles, remoteRoles, "name");
    const rolesToRemove = _.differenceBy(remoteRoles, localRoles, "name");

    if (rolesToInsert && rolesToInsert.length) {
      this.log(
        `Adding Composite in ${localComposite.name}: ${rolesToInsert
          .map((x) => x.name)
          .join(", ")}`
      );
      await this.kc.role.addComposite(
        this.clientOwnId,
        localComposite.name,
        rolesToInsert
      );
    }

    if (rolesToRemove && rolesToRemove.length) {
      logger.warn(
        `Removing Composite in ${localComposite.name}: ${rolesToInsert
          .map((x) => x.name)
          .join(", ")}`
      );
      await this.kc.role.removeComposite(
        this.kcInfo.clientRoleOwn,
        localComposite.name,
        rolesToRemove
      );
    }

    return (
      (rolesToInsert && rolesToInsert.length) ||
      (rolesToRemove && rolesToRemove.length)
    );
  }

  async insertRoles(role) {
    const roleName = role.name;
    const savedRoles = await this.kc.role.create(this.clientOwnId, {
      name: roleName,
    });
    await this.kc.role.update(this.clientOwnId, roleName, {
      ...savedRoles,
      ...role,
    });
  }

  async getAllRoles(idOfClient) {
    const lazyRoles = await this.kc.role.get(idOfClient);
    const roles = await Promise.all(
      lazyRoles.map(({name}) => this.kc.role.get(idOfClient, name))
    );
    return roles.filter(({attributes}) => attributes && Object.keys(attributes).includes('mergeTool'))
  }
}

class ExecutionProcess {
  constructor(pathFile, profileName, reset, drop) {
    const fileData = loadFile(pathFile);
    if (!fileData.profiles) {
      throw new ReferenceError("No profiles found in file");
    }
    if (!fileData.roles) {
      throw new ReferenceError("No roles found in file");
    }

    profileName = Environment.profile || profileName;

    const { roles, profiles } = fileData;
    const profileInfo = profiles[profileName];
    if (!profileInfo) {
      throw new ReferenceError(`Not found ${profileName} profile`);
    }

    this.roles = roles;
    this.setKeyCloakData(loadProfiles(profileInfo));
    this.reset = reset;
    this.drop = drop;
  }

  setKeyCloakData(keycloak) {
    if (keycloak) {
      this.kcInfo = keycloak;
      return;
    }
  }

  async run() {
    this.kc = await createKeycloak({
      baseURL: this.kcInfo.baseUrl,
      realmName: this.kcInfo.realm,
      grant: this.kcInfo.grant,
    });

    this.clients = this.indexClients(await this.kc.clients.get());

    // Realm deve ser o ultimo
    const clientIds = Object.entries(this.roles).sort(
      ([clientNameA], [clientNameB]) => {
        if (clientNameA.toLowerCase() === "realm") {
          return 1;
        }
        if (clientNameB.toLowerCase() === "realm") {
          return -1;
        }
        return 0;
      }
    );

    for (let [clientName, roles] of clientIds) {
      const spinner = ora({prefixText: `Processing client id ${clientName}`, text: "Starting"}).start();
      try {
        const result = await new CreateRolesProcess(
          spinner,
          this.kc,
          this.clients,
          clientName.toLowerCase(),
          roles,
          this.reset,
          this.drop
        ).run();
        spinner.prefixText = `Finish client id ${clientName}`
        if (result) {
          spinner.succeed(`All updated!`);
        } else {
          spinner.succeed(`Nothing for to do...`);
        }
      } catch (e) {
        spinner.fail(`with Fail`);
        throw e;
      }
    }
  }

  indexClients(clients) {
    return clients.reduce(
      (tot, cur) => ({ ...tot, [cur.clientId]: cur.id }),
      {}
    );
  }
}

async function createRoles(pathFile, profileName, reset, drop) {
  await new ExecutionProcess(pathFile, profileName, reset, drop).run();
}

exports.createRoles = createRoles;
