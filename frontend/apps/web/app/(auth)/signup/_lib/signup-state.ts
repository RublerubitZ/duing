import type { College, Grade } from '@duing/types';

export type SignupFormState = {
  // step 1
  email: string;
  password: string;
  passwordConfirm: string;
  // step 2
  name: string;
  studentId: string;
  grade: Grade | '';
  college: College | '';
  major: string;
  phone: string;
  termsOfServiceAgreed: boolean;
  privacyPolicyAgreed: boolean;
};

export const initialSignupState: SignupFormState = {
  email: '',
  password: '',
  passwordConfirm: '',
  name: '',
  studentId: '',
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