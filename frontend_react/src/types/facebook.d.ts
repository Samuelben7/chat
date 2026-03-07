interface FacebookLoginResponse {
  authResponse: {
    code: string;
    accessToken?: string;
    userID?: string;
    expiresIn?: number;
  } | null;
  status: 'connected' | 'not_authorized' | 'unknown';
}

interface FacebookSDK {
  init: (params: {
    appId: string;
    cookie?: boolean;
    xfbml?: boolean;
    version: string;
  }) => void;
  login: (
    callback: (response: FacebookLoginResponse) => void,
    options?: {
      config_id?: string;
      response_type?: string;
      override_default_response_type?: boolean;
      extras?: Record<string, any>;
    }
  ) => void;
}

interface Window {
  FB: FacebookSDK;
  fbAsyncInit: () => void;
}
