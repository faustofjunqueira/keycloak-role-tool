const axios = require("axios");
const { Issuer } = require("openid-client");
const { KCClients } = require("./keycloak-resources/clients");
const { KCRoles } = require("./keycloak-resources/roles");

class Keycloak {
  get authHeader() {
    if (this.tokenSet) {
      return {
        "Content-type": "application/json",
        Authorization: `${this.tokenSet.token_type} ${this.tokenSet.access_token}`,
      };
    }
    return;
  }

  constructor(
    clientOIDC,
    KcIssuer,
    baseURL,
    realmName,
    grant
  ) {
    this.clientOIDC = clientOIDC;
    this.KcIssuer = KcIssuer;
    this.baseURL = baseURL;
    this.realm = realmName;
    this.grant = grant;

    this.request = axios.create({
      baseURL,
    });

    this.request.interceptors.request.use((config) => {
      Object.assign(config.headers, this.authHeader);
      return config;
    });

    this.tokenSet = null;

    this.role = new KCRoles(this);
    this.clients = new KCClients(this);
  }

  async auth() {
    this.tokenSet = await this.getToken();
    this.startRefreshToken();
  }

  startRefreshToken() {
    setInterval(async () => {
      this.tokenSet = await this.clientOIDC.refresh(
        this.tokenSet.refresh_token
      );
      this.startRefreshToken();
    }, this.tokenSet.refresh_expires_in * 800);
  }

  getToken() {
    return this.clientOIDC.grant(this.grant);
  }
}

async function createKeycloak({ baseURL, realmName, grant }) {
  const KcIssuer = await Issuer.discover(baseURL + "/realms/" + realmName);

  const clientOIDC = new KcIssuer.Client({
    client_id: grant.client_id,
    token_endpoint_auth_method: "none",
  });

  const kc = new Keycloak(
    clientOIDC,
    KcIssuer,
    baseURL,
    realmName,
    grant
  );
  await kc.auth();
  return kc;
}

exports.createKeycloak = createKeycloak;
exports.Keycloak = Keycloak;
