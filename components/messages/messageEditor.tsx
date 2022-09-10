import { Button, MultiSelect, SelectItem, Textarea, TextInput } from "@mantine/core";
import { supabaseClient } from "@supabase/auth-helpers-nextjs";
import { IconUser } from "@tabler/icons";
import { useState } from "react";
import { Message } from "../../pages/messages";

type Props = {
  recipient: string,
  onClose: () => void, 
  addMessage: (msg: Message) => void
}

export default function MessageEditor({recipient, onClose, addMessage}: Props) {
  // it is planned to have group messages(?)
  const [recipients, setRecipients] = useState<string[]>([recipient]);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');

  async function SendMessage() {
    const { data: sqlMessages } = await supabaseClient.rpc('send_message', {
      msg_username: recipients[0],
      msg_title: subject,
      msg_content: content
    });

    if(!sqlMessages) {
      alert('error sending message');
    }
    else {
      addMessage(sqlMessages[0] as unknown as Message);
    }
    onClose();
  }

  return (<div className="flex flex-col space-y-4">
    <MultiSelect maxSelectedValues={1} icon={<IconUser />} readOnly
      value={[recipient]} onChange={setRecipients}
      data={recipient ? [{ value: recipient, label: `@${recipient}` }] : []}/>
    <TextInput placeholder="Subject" value={subject} 
      onChange={(event) => setSubject(event.currentTarget.value)}/>
    <Textarea placeholder="Your message here" value={content} 
      onChange={(event) => setContent(event.currentTarget.value)} autosize minRows={4}/>
    <Button onClick={() => {SendMessage();}}>
      Send
    </Button>
  </div>);
}