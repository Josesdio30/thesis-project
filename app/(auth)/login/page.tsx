import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input"

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-blue-900 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
        <div className="flex justify-center mb-6">
          <Image
            src="/st_louis-2.png"
            alt="SMA St. Louis Surabaya Logo"
            width={150}
            height={150}
            className="object-contain"
          />
        </div>
        <form className="space-y-4">
          <div>
            <Input
              type="text"
              placeholder="Username"
              className="w-full border-gray-300 rounded-md"
            />
          </div>
          <div>
            <Input
              type="password"
              placeholder="Password"
              className="w-full border-gray-300 rounded-md"
            />
          </div>
          <Button
            type="submit"
            className="w-full bg-orange-400 hover:bg-orange-600 text-white rounded-full"
          >
            Login
          </Button>
        </form>
      </div>
    </div>
  );
}