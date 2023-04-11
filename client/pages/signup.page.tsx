import { Center, Text, TextInput, PasswordInput, Group, Space, Button, Anchor } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import dayjs from "dayjs";
import { ClientResponseError } from 'pocketbase';
import { useRecoilValue } from "recoil";
import { navigate } from "vite-plugin-ssr/client/router";
import { pocketBaseState } from "../recoil/pocketBase.recoil";

export function Page() {
  const {pb} = useRecoilValue(pocketBaseState);
  const form = useForm({
    initialValues: {
      username: '',
      birthday: new Date(),
      email: '',
      password: '',
      confirmPassword: '',
    },

    validate: {
      username: (value) => (/^[\w][\w\.]*$/.test(value) ? null : 'Invalid username.'),
      birthday: (value) => dayjs(new Date()).diff(value, 'years') >= 13 ? null : 'You must be at least 13 years or older to register.',
      email: (value) => (/^\S+@\S+$/.test(value) ? null : 'Invalid email.'),
      confirmPassword: (value, values) => value === values.password ? null : 'Passwords did not match.',
    },
  });

  return (
    <Center className="h-full">
      <div className="m-auto">
        <Text size="xl" align="center" mt="md">Welcome, to Whirled!</Text>
        <Text size="xs" align="center" mb="md">Welcome to the brave new whirled!</Text>

        <form className="flex flex-col gap-2 w-72" onSubmit={form.onSubmit(async (values) => {
          await pb.collection('users').create({
            username: values.username,
            birthday: values.birthday,
            email: values.email,
            password: values.password,
            passwordConfirm: values.confirmPassword,
          }).then(() => {
            alert('Successfully registered!');
            navigate('/login');
          }).catch((e: ClientResponseError) => {
            form.setFieldError('username', e.response.data.username.message);
            form.setFieldError('email', e.response.data.email.message);
            form.setFieldError('password', e.response.data.password.message);
          })
        })}>
          <Text size="sm">Username</Text>
          <TextInput required placeholder="Your username"
            {...form.getInputProps('username')}
          />

          <Text size="sm">Birthday</Text>
          <DatePickerInput required placeholder="Your birthday"  
            valueFormat="MM/DD/YYYY"
            {...form.getInputProps('birthday')}
          />

          <Text size="sm">Email</Text>
          <TextInput required placeholder="your@email.com"
            {...form.getInputProps('email')}
          />

          <Text size="sm">Password</Text>
          <PasswordInput required placeholder="Your password"
            {...form.getInputProps('password')}
          />

          <Text size="sm">Confirm Password</Text>
          <PasswordInput required placeholder="Confirm password"
            {...form.getInputProps('confirmPassword')}
          />

          <Group position="center">
            <Space />
            <Button fullWidth type="submit">Sign Up</Button>
          </Group>
          <Group position="center" my="md" className="text-sm">
            Already have an account?
            <Anchor href="/login">Login</Anchor>
          </Group>
        </form>  
      </div> 
    </Center>
  );
}