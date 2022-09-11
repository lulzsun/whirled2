import { Button, MultiSelect, ActionIcon, Textarea, TextInput } from "@mantine/core";
import { supabaseClient } from "@supabase/auth-helpers-nextjs";
import { IconDots, IconSend, IconUser } from "@tabler/icons";
import { useState } from "react";
import { Message } from "../../pages/messages";

type Props = {
  isModal?: boolean,
  recipient: string,
  parent_id?: number | null,
  onClose?: () => void, 
  addMessage: (msg: Message) => void
}

export default function MessageEditor({isModal=false, recipient, parent_id, onClose, addMessage}: Props) {
  // it is planned to have group messages(?)
  const [recipients, setRecipients] = useState<string[]>([recipient]);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');

  async function SendMessage() {
    const { data: sqlMessages } = await supabaseClient.rpc('send_message', {
      msg_username: recipients[0],
      msg_title: subject,
      msg_content: content,
      msg_reply_id: parent_id
    });

    if(!sqlMessages) {
      alert('error sending message');
    }
    else {
      addMessage(sqlMessages[0] as unknown as Message);
      setSubject('');
      setContent('');
    }

    if(onClose) onClose();
  }

  return (<div className="flex flex-col space-y-4">
    {isModal && <>
      <MultiSelect maxSelectedValues={1} icon={<IconUser />} readOnly
        value={[recipient]} onChange={setRecipients}
        data={recipient ? [{ value: recipient, label: `@${recipient}` }] : []}/>
      <TextInput placeholder="Subject" value={subject} 
        onChange={(event) => setSubject(event.currentTarget.value)}/>
    </>}

    <div className='flex flex-row w-full space-x-2'>
      <Textarea placeholder="Your message here" value={content} className='grow'
        onChange={(event) => setContent(event.currentTarget.value)} autosize minRows={(isModal ? 4 : 2)}/>
      {!isModal && <div className='flex flex-col justify-between'>
        <ActionIcon variant="filled" color="blue" onClick={() => {SendMessage();}}><IconSend size={16}/></ActionIcon>
        <ActionIcon variant="subtle" color="blue"><IconDots size={16}/></ActionIcon>
      </div>
      }
    </div>
    {isModal && <Button onClick={() => {SendMessage();}}>
      Send
    </Button>}
  </div>);
}