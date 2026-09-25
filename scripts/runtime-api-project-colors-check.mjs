const base = 'http://localhost:4000/api/v1';

async function post(path, payload, cookie) {
  return fetch(base + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(payload),
  });
}

async function main() {
  const unique = String(Date.now());
  const email = 'runtime_color_' + unique + '@gmail.com';
  const username = 'runtimecolor' + unique;
  const password = 'RuntimeColor123A';

  const signup = await post('/auth/signup', {
    username,
    email,
    password,
    confirmPassword: password,
  });
  const signupJson = await signup.json();

  if (!signup.ok) {
    throw new Error('signup failed: ' + JSON.stringify(signupJson));
  }

  const otp = signupJson?.data?.developmentOtp;

  const verify = await post('/auth/verify-otp', {
    email,
    otp,
  });
  const verifyJson = await verify.json();

  if (!verify.ok) {
    throw new Error('verify failed: ' + JSON.stringify(verifyJson));
  }

  const login = await post('/auth/login', {
    emailOrUsername: email,
    password,
  });
  const loginJson = await login.json();

  if (!login.ok) {
    throw new Error('login failed: ' + JSON.stringify(loginJson));
  }

  const cookie = login.headers.get('set-cookie');
  if (!cookie) {
    throw new Error('login cookie missing');
  }

  const createProject = async (name, color) => {
    const response = await fetch(base + '/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({ name, color }),
    });

    return {
      status: response.status,
      body: await response.json(),
    };
  };

  const updateProject = async (projectId, color) => {
    const response = await fetch(base + '/projects/' + projectId, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({ color }),
    });

    return {
      status: response.status,
      body: await response.json(),
    };
  };

  const blueCreated = await createProject('Runtime BLUE ' + unique, 'BLUE');
  const greenCreated = await createProject('Runtime GREEN ' + unique, 'GREEN');

  const legacyCreated = await fetch(base + '/projects', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie,
    },
    body: JSON.stringify({ name: 'Runtime LEGACY ' + unique }),
  });
  const legacyBody = await legacyCreated.json();
  const legacyId = legacyBody?.data?.project?.id;

  let legacyUpdated = null;
  let legacyCleared = null;
  if (legacyId) {
    legacyUpdated = await updateProject(legacyId, 'RED');
    legacyCleared = await updateProject(legacyId, null);
  }

  const listResponse = await fetch(base + '/projects', {
    method: 'GET',
    headers: {
      cookie,
    },
  });
  const listBody = await listResponse.json();

  const listed = (listBody?.data?.projects ?? [])
    .filter((project) => typeof project?.name === 'string' && project.name.includes(unique))
    .map((project) => ({ id: project.id, name: project.name, color: project.color }));

  console.log(
    JSON.stringify(
      {
        unique,
        email,
        created: {
          blue: {
            status: blueCreated.status,
            project: blueCreated.body?.data?.project
              ? {
                  id: blueCreated.body.data.project.id,
                  name: blueCreated.body.data.project.name,
                  color: blueCreated.body.data.project.color,
                }
              : blueCreated.body,
          },
          green: {
            status: greenCreated.status,
            project: greenCreated.body?.data?.project
              ? {
                  id: greenCreated.body.data.project.id,
                  name: greenCreated.body.data.project.name,
                  color: greenCreated.body.data.project.color,
                }
              : greenCreated.body,
          },
          legacy: {
            status: legacyCreated.status,
            project: legacyBody?.data?.project
              ? {
                  id: legacyBody.data.project.id,
                  name: legacyBody.data.project.name,
                  color: legacyBody.data.project.color,
                }
              : legacyBody,
          },
        },
        updatedLegacyToRed: legacyUpdated,
        clearedLegacyColor: legacyCleared,
        listStatus: listResponse.status,
        listed,
      },
      null,
      2,
    ),
  );
}

await main();
