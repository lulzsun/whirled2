import { atom } from 'recoil';

export interface User {
  id: string | null;
  username: string;
  nickname: string;
  avatar_url: string | '/default_profile.png';
}

export const userState = atom({
  key: 'userState',
  default: {} as unknown as User,
});