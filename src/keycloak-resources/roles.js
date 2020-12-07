class KCRoles {
  constructor(kcClient) {
    this.kc = kcClient;
  }

  url(idOfClient, suffix="") {
    if(idOfClient) {
      return `/admin/realms/${this.kc.realm}/clients/${idOfClient}/roles${suffix}`;
    }
    return `/admin/realms/${this.kc.realm}/roles${suffix}`;
  }

  async get(idOfClient, roleName) {
    const response = await this.kc.request.get(
      this.url(idOfClient,roleName ? "/"+roleName : "")
    );
    return response.data;
  }

  async create(idOfClient, roleDef) {
    const response = await this.kc.request.post(
      this.url(idOfClient), roleDef
    );
    return response.data;
  }

  async update(idOfClient, roleName, roleDef) {
    const response = await this.kc.request.put(
      this.url(idOfClient, `/${roleName}`), roleDef
    );
    return response.data;
  }

  async delete(idOfClient, roleName) {
    const response = await this.kc.request.delete(
      this.url(idOfClient, `/${roleName}`)
    );
    return response.data;
  }

  async addComposite(idOfClient, roleName, rolesDef) {
    const response = await this.kc.request.post(
      this.url(idOfClient, `/${roleName}/composites`), rolesDef
    );
    return response.data;
  }

  async getComposite(idOfClient, roleName ) {
    const response = await this.kc.request.get(
      this.url(idOfClient, `/${roleName}/composites`)
    );
    return response.data;
  }

  async removeComposite(idOfClient, roleName, rolesDef) {
    const response = await this.kc.request.delete(
      this.url(idOfClient, `/${roleName}/composites`), {data: rolesDef}
    );
    return response.data;
  }

}

exports.KCRoles = KCRoles;
