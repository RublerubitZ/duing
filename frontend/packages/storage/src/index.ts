// 플랫폼 추상화 storage 인터페이스.
// 웹은 './web' (localStorage), React Native 는 './native' (AsyncStorage) 를 사용한다.
//
// 사용 예 (앱 진입점에서 1회 주입):
//   import { setStorage } from '@duing/storage';
//   import { webStorage } from '@duing/storage/web';
//   setStorage(webStorage);

export type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

let activeStorage: Storage | null = null;

export function setStorage(storage: Storage): void {
  activeStorage = storage;
}

export function getStorage(): Storage {
  if (!activeStorage) {
    throw new Error(
      '[@duing/storage] storage 가 주입되지 않았습니다. 앱 진입점에서 setStorage() 를 호출하세요.',
    );
  }
  return activeStorage;
}
