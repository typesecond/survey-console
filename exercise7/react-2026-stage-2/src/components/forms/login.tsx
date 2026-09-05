import { Form, useActionData } from 'react-router';

const Login = () => {
  const actionData = useActionData();

  return (
    <Form
      method="post"
      className="max-w-sm mx-auto mt-16 p-8 bg-white rounded-2xl shadow-lg"
    >
      <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">
        Log In
      </h2>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Username</label>
          <input
            type="text"
            name="username"
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Password</label>
          <input
            type="password"
            name="password"
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>
      <button
        type="submit"
        className="mt-6 w-full py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
      >
        Submit!
      </button>
      {actionData?.isErr && actionData.error.message ? (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{actionData.error.message}</p>
        </div>
      ) : null}
    </Form>
  );
};

export default Login;
