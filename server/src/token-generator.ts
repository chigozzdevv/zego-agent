import crypto from 'crypto'

interface TokenPayload {
  room_id?: string
  privilege?: {
    1: number  // login privilege
    2: number  // publish privilege  
  }
  stream_id_list?: string[]
}

export function generateToken04(
  appId: number,
  userId: string, 
  serverSecret: string,
  effectiveTimeInSeconds: number,
  payload?: TokenPayload
): string {
  // Token header
  const header = {
    alg: 'HS256',
    typ: 'zego-token-04'
  }

  // Token body
  const body = {
    iss: appId,
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + effectiveTimeInSeconds,
    ...(payload && { payload })
  }

  // Base64 encode header and body
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
  const bodyB64 = Buffer.from(JSON.stringify(body)).toString('base64url')
  
  // Create signature
  const data = `${headerB64}.${bodyB64}`
  const signature = crypto
    .createHmac('sha256', serverSecret)
    .update(data)
    .digest('base64url')

  return `${data}.${signature}`
}