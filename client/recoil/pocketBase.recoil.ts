import jwtDecode from "jwt-decode";
import PocketBase, { Admin, Record } from "pocketbase";
import { atom, selector } from "recoil";
import { setRecoil } from "recoil-nexus";

interface AuthToken {
  exp: number;
}

const userState = atom<Record | Admin | null>({
  key: 'user',
  default: null,
});

const pbState = atom({
  key: 'pb',
  default: new PocketBase(),
  effects: [
    ({setSelf}) => {
      const pb = new PocketBase();
      const refreshAuth = setInterval(async () => {
        if (!pb.authStore.isValid) return;
        const decoded = jwtDecode<AuthToken>(pb.authStore.token);
        const tokenExpiration = decoded.exp;
        const expirationWithBuffer = (decoded.exp + 300000) / 1000;
        if (tokenExpiration < expirationWithBuffer) {
          await pb.collection("users").authRefresh();
        }
      }, 120000);
      const authChange = pb.authStore.onChange((_, model) => {
        console.log(model);
        setRecoil(userState, model);
      });
      setSelf(pb);
      return () => {
        clearInterval(refreshAuth);
        authChange();
      }
    }
  ],
  dangerouslyAllowMutability: true,
});

export const pocketBaseState = selector({
  key: 'pocketBase',
  get: ({get}) => {
    const pb = get(pbState);
    let user = get(userState);
    if (user == null) {
      user = pb.authStore.model;
    }
    return {pb, user};
  },
  dangerouslyAllowMutability: true,
  // set: ({set}, value) => {
  //   if (value instanceof DefaultValue) {
  //     set(pbState, value);
  //     set(userState, value);
  //     return;
  //   }
  //   set(pbState, value.pb);
  //   set(userState, value.user);
  // },
});