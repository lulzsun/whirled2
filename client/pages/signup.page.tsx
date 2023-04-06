import { Center, Text, TextInput, PasswordInput, Group, Space, Button, Anchor } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import dayjs from "dayjs";

export function Page() {
  const form = useForm({
    initialValues: {
      username: '',
      birthday: new Date(),
      email: '',
      password: '',
      confirmPassword: '',
    },

    validate: {
      birthday: (value) => dayjs(new Date()).diff(value, 'years') >= 13 ? null : 'You must be at least 13 years old',
      email: (value) => (/^\S+@\S+$/.test(value) ? null : 'Invalid email'),
      confirmPassword: (value, values) => value === values.password ? null : 'Passwords did not match',
    },
  });

  return (
    <Center className="flex flex-col w-full h-full" mx="auto">
      <Text size="xl" mt="md">Welcome, to Whirled!</Text>
      <Text size="xs">Welcome to the brave new whirled!</Text>

      <form className="w-72" onSubmit={form.onSubmit((values) => console.log(values.email, values.password, values.username, values.birthday))}>
        <Text size="sm" mt="md">Username</Text>
        <TextInput required placeholder="Your username"
          {...form.getInputProps('username')}
        />

        <Text size="sm" mt="md">Birthday</Text>
        <DatePickerInput required placeholder="Your birthday"  
          valueFormat="MM/DD/YYYY"
          {...form.getInputProps('birthday')}
        />

        <Text size="sm" mt="md">Email</Text>
        <TextInput required placeholder="your@email.com"
          {...form.getInputProps('email')}
        />

        <Text size="sm" mt="md">Password</Text>
        <PasswordInput required placeholder="Your password"
          {...form.getInputProps('password')}
        />

        <Text size="sm" mt="md">Confirm Password</Text>
        <PasswordInput required placeholder="Confirm password"
          {...form.getInputProps('confirmPassword')}
        />

        <Group position="center" mt="md">
          <Space h="md" />
          <Button fullWidth type="submit">Sign Up</Button>
        </Group>
        <Group position="center" mt="md" className="text-sm">
          Already have an account?
          <Anchor href="/login">Login</Anchor>
        </Group>
      </form>
    </Center>
  );
}