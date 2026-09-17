export type LoginCredentials = {
  producttype: string;
  enviroment: string;
  login: string;
  password: string;
};

export type AuthSessionUser = {
  fullName: string;
  email: string;
  role: string;
  phoneNumber?: string;
};

export type LoginSession = {
  accessToken: string;
  refreshToken?: string;
  user: AuthSessionUser;
};
