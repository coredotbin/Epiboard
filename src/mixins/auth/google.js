const clientId = '746645565897-flmj7tj1hu754tl4uul2do8cq1sslp27.apps.googleusercontent.com';
const clientSecret = 'vP98OJ0nebq8qbeoBzKT5HvG';

const apiUrl = {
  webAuth: 'https://accounts.google.com/o/oauth2/v2/auth',
  revoke: 'https://accounts.google.com/o/oauth2/revoke',
  token: 'https://www.googleapis.com/oauth2/v3/token',
  tokenInfo: 'https://www.googleapis.com/oauth2/v3/tokeninfo',
};

export default {
  computed: {
    $gauth_isConnected() {
      return this.$store.state.cache.google.accessToken
        && this.$store.state.cache.google.refreshToken;
    },
  },
  methods: {
    $gauth_authorize(scope, state) {
      const params = [
        `client_id=${clientId}`,
        'response_type=code',
        'access_type=offline',
        'include_granted_scopes=true',
        'prompt=consent',
        `state=${encodeURIComponent(state)}`,
        `redirect_uri=${encodeURIComponent(browser.identity.getRedirectURL())}`,
        `scope=${encodeURIComponent(scope)}`,
      ].join('&');
      return browser.identity.launchWebAuthFlow({
        interactive: true,
        url: `${apiUrl.webAuth}?${params}`,
      });
    },
    $gauth_extractCode(redirectUri, state) {
      const m = redirectUri.match(/[#?](.*)/);
      if (!m || m.length < 1) {
        return null;
      }
      const params = new URLSearchParams(m[1].split('#')[0]);
      const paramState = params.get('state');
      if (paramState !== state) {
        throw new Error('State differ');
      }
      const code = params.get('code');
      if (!code) {
        throw new Error('Invalid code');
      }
      return code;
    },
    $gauth_initialize(scope) {
      if (!this.$gauth_isConnected) {
        const state = btoa(window.crypto.getRandomValues(new Uint8Array(16)));
        return this.$gauth_authorize(scope, state)
          .then(url => this.$gauth_getTokens(this.$gauth_extractCode(url, state)));
      }
      return this.$gauth_validateTokens(scope);
    },
    $gauth_validateTokens() {
      return this.axios
        .get(`${apiUrl.tokenInfo}?access_token=${this.$store.state.cache.google.accessToken}`)
        .catch(() => this.$gauth_revokeTokens());
    },
    $gauth_revokeTokens() {
      const params = [
        `client_id=${clientId}`,
        `client_secret=${clientSecret}`,
        'grant_type=refresh_token',
        `refresh_token=${this.$store.state.cache.google.refreshToken}`,
      ].join('&');
      return this.axios.post(`${apiUrl.token}?${params}`)
        .then((res) => {
          this.$store.commit('SET_GOOGLE', {
            exp: Date.now() + (res.data.expire_in * 1000),
            accessToken: res.data.access_token,
          });
        })
        .catch((err) => {
          if (err.response) {
            this.$store.commit('DEL_GOOGLE');
          }
          throw err;
        });
    },
    $gauth_revoke() {
      return this.axios.post(`${apiUrl.revoke}?token=${this.$store.state.cache.google.accessToken}`)
        .then(() => {
          this.$store.commit('DEL_GOOGLE');
        });
    },
    $gauth_getTokens(code) {
      const params = [
        `client_id=${clientId}`,
        `client_secret=${clientSecret}`,
        `redirect_uri=${encodeURIComponent(browser.identity.getRedirectURL())}`,
        'grant_type=authorization_code',
        `code=${code}`,
      ].join('&');
      return this.axios.post(`${apiUrl.token}?${params}`)
        .then((res) => {
          const payload = {
            accessToken: res.data.access_token,
            refreshToken: res.data.refresh_token,
            exp: Date.now() + (res.data.expire_in * 1000),
          };
          this.$store.commit('SET_GOOGLE', payload);
          return res.data.access_token;
        });
    },
    $gauth_http(method, url, data = {}) {
      return this.axios({
        url,
        method,
        data,
        headers: {
          Authorization: `Bearer ${this.$store.state.cache.google.accessToken}`,
          'Content-type': 'application/json',
        },
      }).then(res => res.data);
    },
  },
};
