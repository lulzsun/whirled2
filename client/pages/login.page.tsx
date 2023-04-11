import { Center, TextInput, PasswordInput, Group, Checkbox, Anchor, Space, Button, Text, Portal } from "@mantine/core";
import { Notifications, notifications } from '@mantine/notifications';
import { useForm } from "@mantine/form";
import { ClientResponseError } from 'pocketbase';
import { navigate } from "vite-plugin-ssr/client/router";
import { IconX } from "@tabler/icons-react";
import { pocketBaseState } from "../recoil/pocketBase.recoil";
import { useRecoilValue } from "recoil";

Page.metaData = {
  title: 'Welcome back!',
  description: "The brave new whirled..."
}

export function Page() {
  const {pb} = useRecoilValue(pocketBaseState);
  const form = useForm({
    initialValues: {
      email: '',
      password: '',
      rememberMe: false,
    },

    // validate: {
    //   email: (value) => (/^\S+@\S+$/.test(value) ? null : 'Invalid email'),
    // },
  });

  return (
    <Center className="h-full">
      <div className="m-auto">
        <Notifications position="bottom-right"/>
        <Text size="xl" align="center" mt="md">Hello, Whirled!</Text>
        <Text size="xs" align="center" mb="md">Welcome back to the brave new whirled!</Text>

        <form className="flex flex-col gap-2 w-72" onSubmit={form.onSubmit(async (values) => {
          await pb.collection('users').authWithPassword(
            values.email, values.password
          ).then(() => {
            // pb.collection("users").authRefresh();
            navigate('/');
          }).catch((e: ClientResponseError) => {
            console.log(e);
            notifications.show({
              icon: <IconX size="1rem" />,
              color: "red",
              message: e.response.message,
              autoClose: 5000,
            });
          })
        })}>
          <Text size="sm">Username or Email</Text>
          <TextInput required placeholder="Your username or email"
            {...form.getInputProps('email')}
          />

          <Text size="sm">Password</Text>
          <PasswordInput required placeholder="Your password"
            {...form.getInputProps('password')}
          />

          <Group position="apart">
            <Checkbox label="Remember me" />
            <Anchor
              onClick={(event: { preventDefault: () => void; }) => event.preventDefault()}
              href="#"
              size="sm"
            >
              Forgot your password?
            </Anchor>
          </Group>

          <Group position="center">
            <Space />
            <Button fullWidth type="submit">Login</Button>
          </Group>
          <Group position="center" my="md" className="text-sm">
            Don't have an account?
            <Anchor href="/signup">Sign Up</Anchor>
          </Group>
        </form>
      </div>
    </Center>
  );
}