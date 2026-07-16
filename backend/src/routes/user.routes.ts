import { Router } from "express";
import { authenticate, authorize } from "@/middleware/auth";
import { listUsers, createUser, updateUser, deleteUser, bulkDeleteUsers } from "@/controllers/user.controller";

const router = Router();

router.use(authenticate, authorize("ADMIN"));
router.get("/", listUsers);
router.post("/", createUser);
router.post("/bulk-delete", bulkDeleteUsers);
router.patch("/:id", updateUser);
router.delete("/:id", deleteUser);

export default router;
