import { atom } from 'recoil';

export interface User {
  id: string | null;
  username: string;
  nickname: string;
  avatar_url?: string;
}

export const userState = atom({
  key: 'userState',
  default: null as unknown as User,
});