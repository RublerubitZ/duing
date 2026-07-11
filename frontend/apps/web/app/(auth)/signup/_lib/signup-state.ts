import type { College, Grade } from '@duing/types';

export type SignupFormState = {
  password: string;
  passwordConfirm: string;
  name: string;
  studentId: string;
  studentIdConfirm: string;
  grade: Grade | '';
  college: College | '';
  major: string;
  phone: string;
  termsOfServiceAgreed: boolean;
  privacyPolicyAgreed: boolean;
};

export const initialSignupState: SignupFormState = {
  password: '',
  passwordConfirm: '',
  name: '',
  studentId: '',
  studentIdConfirm: '',
  grade: '',
  college: '',
  major: '',
  phone: '',
  termsOfServiceAgreed: false,
  privacyPolicyAgreed: false,
};

export type SignupAction = {
  type: 'SET_FIELD';
  field: keyof SignupFormState;
  value: string | boolean;
};

export function signupReducer(state: SignupFormState, action: SignupAction): SignupFormState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    default:
      return state;
  }
}
