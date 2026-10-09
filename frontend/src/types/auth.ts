export interface AuthUser {
  id: string;
  email: string;
  createdAt: string; // ISO 8601
}

export interface Credentials {
  email: string;
  password: string;
}

export interface SignupInput extends Credentials {
  passwordConfirm: string; // 회원가입 전용. 서버로 그대로 전송하되 DB에는 저장되지 않는다
}
