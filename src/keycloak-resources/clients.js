class KCClients {

  constructor(kcClient) {
    this.kc = kcClient;
  }

  url(suffix="") {
    return `/admin/realms/${this.kc.realm}/clients${suffix}`;
  }

  async get(id) {
    const response = await this.kc.request.get(
      this.url(id ? "/"+id : "")
    );
    return response.data;
  }

  async getByClientId(clientId) {
    const response = await this.kc.request.get(
      this.url(), {params: {clientId}}
    );
    return response.data;
  }

  async create(roleDef) {
    const response = await this.kc.request.post(
      this.url(), roleDef
    );
    return response.data;
  }

  async delete(roleName) {
    const response = await this.kc.request.delete(
      this.url(`/${roleName}`)
    );
    return response.data;
  }

}

exports.KCClients = KCClients;
