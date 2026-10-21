import { failure } from '../../../../lib/api';
import { firebaseSignIn } from '../../../../lib/login';

export const dynamic='force-dynamic';
export async function POST(request:Request){try{return await firebaseSignIn(request,['google.com']);}catch(error){return failure(error);}}
