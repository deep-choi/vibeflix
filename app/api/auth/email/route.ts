import { failure } from '../../../../lib/api';
import { firebaseSignIn } from '../../../../lib/login';

// VIBEFLIX email/password accounts (Firebase Authentication). Only verified emails get a session.
export const dynamic='force-dynamic';
export async function POST(request:Request){try{return await firebaseSignIn(request,['password']);}catch(error){return failure(error);}}
