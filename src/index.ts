const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,PUT,OPTIONS,DELETE",
  "Access-Control-Max-Age": "86400",
}

async function handelHeadRequest() {
  let responseHeaders = new Headers(corsHeaders)
  responseHeaders.set("Access-Control-Allow-Origin", "*")
  return new Response(null, {
    headers: responseHeaders,
  })
}

async function handleOptions(request: Request) {
  // Make sure the necessary headers are present
  // for this to be a valid pre-flight request
  let headers = request.headers
  if (
    headers.get("Origin") !== null &&
    headers.get("Access-Control-Request-Method") !== null &&
    headers.get("Access-Control-Request-Headers") !== null
  ) {
    // Handle CORS pre-flight request.
    let respHeaders = {
      ...corsHeaders,
      // Allow all future content Request headers to go back to browser
      // such as Authorization (Bearer) or X-Client-Name-Version
      "Access-Control-Allow-Headers":
        request.headers.get("Access-Control-Request-Headers") ?? "",
    }

    return new Response(null, {
      headers: respHeaders,
    })
  } else {
    // Handle standard OPTIONS request.
    return new Response(null, {
      headers: {
        Allow: "HEAD, GET, PUT, OPTIONS, DELETE",
      },
    })
  }
}

const parseTask = (url: string) =>
  decodeURI(new URL(url).pathname)
    .replace(/(^\/+|\/+$)/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")

async function authenticate(
  request: Request,
  env: Env,
  handler: (request: Request, env: Env) => Promise<Response>
) {
  const { protocol, hostname } = new URL(request.url)
  // In the case of a Basic authentication, the exchange
  // MUST happen over an HTTPS (TLS) connection to be secure.
  if (
    hostname !== "localhost" &&
    ("https:" !== protocol ||
      "https" !== request.headers.get("x-forwarded-proto"))
  ) {
    return new Response("Secure connection required", { status: 403 })
  }

  const Authorization = request.headers.get("Authorization") ?? ""

  const [scheme, encoded] = Authorization.split(" ")

  if (!encoded || scheme !== "Basic") {
    return new Response("Malformed authorization header.", { status: 403 })
  }

  // Decodes the base64 value and performs unicode normalization.
  // @see https://datatracker.ietf.org/doc/html/rfc7613#section-3.3.2 (and #section-4.2.2)
  // @see https://dev.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String/normalize
  const buffer = Uint8Array.from(atob(encoded), (character) =>
    character.charCodeAt(0)
  )
  const decoded = new TextDecoder().decode(buffer).normalize()

  // The username & password are split by the first colon.
  //=> example: "username:password"
  const index = decoded.indexOf(":")

  // The user & password are split by the first colon and MUST NOT contain control characters.
  // @see https://tools.ietf.org/html/rfc5234#appendix-B.1 (=> "CTL = %x00-1F / %x7F")
  if (index === -1 || /[\0-\x1F\x7F]/.test(decoded)) {
    return new Response("Invalid authorization value.", { status: 403 })
  }

  if (decoded !== `${env.USERNAME ?? ""}:${env.PASSWORD ?? ""}`) {
    return new Response("Invalid authorization credentials.", { status: 403 })
  }

  return handler(request, env)
}

async function handleGetRequest(request: Request, env: Env) {
  if (new URL(request.url).pathname === "/favicon.ico")
    return new Response("Not Found", { status: 404 })

  let task = parseTask(request.url)

  if (task === "") {
    // List all tasks
    let _tasks = await env.COUNTER_STORAGE.list()
    const tasks = _tasks.keys.map((key) => {
      return key.name
    })
    return new Response(JSON.stringify({ tasks }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  let value = await env.COUNTER_STORAGE.get(task)
  let date = value ? new Date(value) : null
  let message = "its been ages since"
  if (date) {
    let days =
      ((new Date().getTime() - date.getTime()) / (24 * 60 * 60 * 1000)) | 0
    message = `its been ${days} days since`
    if (days === 1) {
      message = "its been 1 day since"
    }
  }

  return fetch(`https://img.shields.io/badge/${message}-${task}-green`)
}

async function handlePutRequest(request: Request, env: Env) {
  let task = parseTask(request.url)

  if (task === "") return new Response("Bad Request", { status: 400 })

  return env.COUNTER_STORAGE.put(task, new Date().toISOString())
    .then(() => new Response("Great work!"))
    .catch((e) => {
      console.log(e)
      return new Response(`Error: ${e}`, { status: 500 })
    })
}

async function handleDeleteRequest(request: Request, env: Env) {
  let task = parseTask(request.url)

  if (task === "") return new Response("Bad Request", { status: 400 })

  return env.COUNTER_STORAGE.delete(task)
    .then(() => new Response("Task deleted"))
    .catch((e) => {
      console.log(e)
      return new Response(`Error: ${e}`, { status: 500 })
    })
}

export interface Env {
  COUNTER_STORAGE: KVNamespace
  USERNAME: string
  PASSWORD: string
}

const worker = {
  async fetch(request: Request, env: Env) {
    switch (request.method) {
      case "HEAD":
        return handelHeadRequest()
      case "OPTIONS":
        return handleOptions(request)
      case "GET":
        return handleGetRequest(request, env)
      case "PUT":
        return authenticate(request, env, handlePutRequest)
      case "DELETE":
        return authenticate(request, env, handleDeleteRequest)
      default:
        return new Response("Method not allowed", { status: 405 })
    }
  },
}

export default worker
